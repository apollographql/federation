use actix_cors::Cors;
use actix_web::{dev, middleware, post, web, App, HttpRequest, HttpResponse, HttpServer, Result};
use actix_web_opentelemetry::RequestMetrics;
use apollo_stargate_lib::common::Opt;
use apollo_stargate_lib::transports::http::{GraphQLRequest, RequestContext, ServerState};
use apollo_stargate_lib::{Stargate, StargateOpts};
use http::header::HeaderName;
use http::{header, HeaderMap, HeaderValue};
use opentelemetry::sdk;
use std::collections::HashSet;
use std::fs;
use std::iter::FromIterator;
use tracing::{debug, info, instrument};
use tracing_actix_web::TracingLogger;
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
    let mut header_map = HeaderMap::new();

    let propagate_headers = &data.stargate.propagate_headers;

    if let Some(headers) = propagate_headers {
        for (header_name, header_value) in http_req.headers().iter() {
            if headers.contains(&header_name.to_string()) {
                header_map.append(header_name, header_value.clone());
            }
        }
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

    let propagate_headers = opt.propagate_headers.clone();

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
        Stargate::new(StargateOpts {
            schema: &MANIFEST,
            propagate_headers,
        })
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

#[cfg(test)]
mod tests {
    use std::collections::HashSet;
    use std::iter::FromIterator;

    #[test]
    fn test_something() {
        let set: HashSet<&str> = HashSet::from_iter(vec!["abc"]);

        assert!(set.contains("abc"))
    }
}
