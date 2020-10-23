use std::collections::HashMap;
use std::fs;

use actix_cors::Cors;
use actix_web::{
    dev, http, middleware, post, web, App, HttpRequest, HttpResponse, HttpServer, Result,
};
use actix_web_opentelemetry::RequestMetrics;
use opentelemetry::sdk;
use tracing::{debug, info, instrument};
use tracing_actix_web::TracingLogger;

use actix_web::http::{HeaderMap, HeaderName, HeaderValue};
use apollo_stargate_lib::common::Opt;
use apollo_stargate_lib::transports::http::{GraphQLRequest, RequestContext, ServerState};
use apollo_stargate_lib::Stargate;

mod telemetry;

#[post("/")]
#[instrument(skip(request, http_req, data))]
async fn index(
    request: web::Json<GraphQLRequest>,
    http_req: HttpRequest,
    data: web::Data<ServerState<'static>>,
) -> Result<HttpResponse> {
    let ql_request = request.into_inner();

    // Build a map of headers so we can later propogate them to downstream services
    let header_map: HashMap<&str, &str> = http_req
        .headers()
        .iter()
        .filter(|(_, value)| value.to_str().is_ok())
        .map(|(name, value)| (name.as_str(), value.to_str().unwrap()))
        .collect();

    let invalid_headers: Vec<&str> = http_req
        .headers()
        .iter()
        // `value.to_str()` will only return a string slice for visible ASCII characters, else it
        // will error. Instead, we can take it `as_bytes()` and convert it back to a string later.
        .filter(|(_, value)| !value.to_str().is_ok())
        .map(|(name, _)| name.as_str())
        .collect();

    if !invalid_headers.is_empty() {
        todo!("handle invalid header values")
    }

    let context = RequestContext {
        graphql_request: ql_request,
        header_map,
    };

    let result = match data.stargate.execute_query(&context).await {
        Ok(result) => result,
        Err(_) => todo!("handle error cases when executing query"),
    };
    Ok(HttpResponse::Ok().json(result))
}

fn health() -> HttpResponse {
    HttpResponse::Ok().finish()
}

static mut MANIFEST: String = String::new();

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let opt = Opt::default();
    telemetry::init(&opt).expect("failed to initialize tracer.");
    let meter = sdk::Meter::new("stargate");
    let request_metrics = RequestMetrics::new(
        meter,
        Some(|req: &dev::ServiceRequest| {
            req.path() == "/metrics" && req.method() == http::Method::GET
        }),
    );

    info!("{}", opt.pretty_print());

    debug!("Initializing stargate instance");
    let stargate = unsafe {
        MANIFEST = fs::read_to_string(&opt.manifest)?;
        Stargate::new(&MANIFEST)
    };
    let stargate = web::Data::new(ServerState { stargate });

    HttpServer::new(move || {
        let cors = Cors::new()
            .allowed_methods(vec!["GET", "POST", "OPTIONS"])
            .allowed_origin("https://studio.apollographql.com")
            .supports_credentials()
            .finish();

        App::new()
            .app_data(stargate.clone())
            .wrap(request_metrics.clone())
            .wrap(middleware::Logger::default())
            .wrap(TracingLogger)
            .wrap(middleware::Compress::default())
            .wrap(cors)
            .service(index)
            .service(web::resource("/health").to(health))
    })
    .bind(format!("0.0.0.0:{}", opt.port))?
    .run()
    .await
}
