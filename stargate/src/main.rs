use actix_cors::Cors;
use actix_web::{middleware, post, web, App, HttpResponse, HttpServer, Result};
use actix_web_opentelemetry::RequestTracing;
use apollo_stargate_lib::common::Opt;
use apollo_stargate_lib::transports::http::{GraphQLRequest, RequestContext, ServerState};
use apollo_stargate_lib::Stargate;
use env_logger::Env;
use opentelemetry::api::{Key, Provider};
use opentelemetry::sdk;
use std::fs;
use tracing::instrument;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::Registry;

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

fn init_observability() -> Result<(), Box<dyn std::error::Error>> {
    env_logger::from_env(Env::default().default_filter_or("info")).init();

    tracing::debug!("initializing jaeger trace exporter");
    let exporter = opentelemetry_jaeger::Exporter::builder()
        .with_collector_endpoint("http://localhost:14268/api/traces")
        .with_process(opentelemetry_jaeger::Process {
            service_name: String::from("stargate"),
            tags: vec![Key::new("exporter").string("jaeger")],
        })
        .init()?;

    tracing::debug!("initializing jaeger trace provider");
    let provider = sdk::Provider::builder()
        .with_simple_exporter(exporter)
        .with_config(sdk::Config {
            default_sampler: Box::new(sdk::Sampler::AlwaysOn),
            ..Default::default()
        })
        .build();

    {
        let tracer = provider.get_tracer("stargate");
        let telemetry = tracing_opentelemetry::layer().with_tracer(tracer);
        let subscriber = Registry::default().with(telemetry);
        tracing::subscriber::set_global_default(subscriber).unwrap();
    }

    tracing::debug!("setting global trace provider");
    opentelemetry::global::set_provider(provider);

    Ok(())
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    init_observability().expect("failed to initialize observability (traces, metrics)");
    let opt = Opt::default();

    tracing::debug!("Initializing stargate instance");
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
            .wrap(RequestTracing::new())
            .wrap(middleware::Compress::default())
            .wrap(cors)
            .service(index)
    })
    .bind(format!("127.0.0.1:{}", opt.port))?
    .run()
    .await
}
