use actix_cors::Cors;
use actix_web::{middleware, post, web, App, HttpResponse, HttpServer, Result};
use apollo_stargate_lib::common::Opt;
use apollo_stargate_lib::transports::http::{GraphQLRequest, RequestContext, ServerState};
use apollo_stargate_lib::Stargate;
use std::fs;
use tracing::{debug, info, instrument};
use tracing_actix_web::TracingLogger;

mod telemetry;

#[post("/")]
#[instrument(skip(request, data))]
async fn index(
    request: web::Json<GraphQLRequest>,
    data: web::Data<ServerState<'static>>,
) -> Result<HttpResponse> {
    let ql_request = request.into_inner();
    let context = RequestContext {
        graphql_request: ql_request,
    };
    let result = match data.stargate.execute_query(&context).await {
        Ok(result) => result,
        Err(_) => todo!("handle error cases when executing query"),
    };
    Ok(HttpResponse::Ok().json(result))
}

static mut MANIFEST: String = String::new();

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let opt = Opt::default();
    telemetry::init(&opt).expect("failed to initialize tracer.");

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
            .wrap(middleware::Logger::default())
            .wrap(TracingLogger)
            .wrap(middleware::Compress::default())
            .wrap(cors)
            .service(index)
    })
    .bind(format!("0.0.0.0:{}", opt.port))?
    .run()
    .await
}
