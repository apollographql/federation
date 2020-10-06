use actix_cors::Cors;
use actix_web::{middleware, post, web, App, HttpResponse, HttpServer, Result};
use actix_web_opentelemetry::RequestTracing;
use apollo_stargate_lib::common::Opt;
use apollo_stargate_lib::transports::http::{GraphQLRequest, RequestContext, ServerState};
use apollo_stargate_lib::Stargate;
use opentelemetry::api::{Key, Provider};
use opentelemetry::sdk;
use std::fs;
use tracing::{debug, instrument};
use tracing_actix_web::TracingLogger;
use tracing_bunyan_formatter::{BunyanFormattingLayer, JsonStorageLayer};
use tracing_log::LogTracer;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::{EnvFilter, Registry};

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
    // env_logger::from_env(Env::default().default_filter_or("info")).init();
    LogTracer::init().expect("Failed to set logger");

    debug!("initializing jaeger trace exporter");
    let exporter = opentelemetry_jaeger::Exporter::builder()
        .with_collector_endpoint("http://localhost:14268/api/traces")
        .with_process(opentelemetry_jaeger::Process {
            service_name: String::from("stargate"),
            tags: vec![Key::new("exporter").string("jaeger")],
        })
        .init()?;

    debug!("initializing jaeger trace provider");
    let provider = sdk::Provider::builder()
        .with_simple_exporter(exporter)
        .with_config(sdk::Config {
            default_sampler: Box::new(sdk::Sampler::AlwaysOn),
            ..Default::default()
        })
        .build();

    let subscriber = Registry::default()
        .with(tracing_opentelemetry::layer().with_tracer(provider.get_tracer("stargate")))
        .with(EnvFilter::try_from_default_env().unwrap_or(EnvFilter::new("info")))
        // .with(tracing_subscriber::fmt::layer())
        .with(JsonStorageLayer)
        .with(BunyanFormattingLayer::new(
            String::from("stargate"),
            std::io::stdout,
        ));

    tracing::subscriber::set_global_default(subscriber).expect("Failed to set subscriber");

    debug!("setting global trace provider");
    opentelemetry::global::set_provider(provider);

    Ok(())
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    init_observability().expect("failed to initialize tracer.");
    let opt = Opt::default();

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
            // XXX: Gives us access log looking messages, but should be redundant bc of `TracingLogger` ??
            .wrap(middleware::Logger::default())
            .wrap(TracingLogger)
            .wrap(RequestTracing::new())
            .wrap(middleware::Compress::default())
            .wrap(cors)
            .service(index)
    })
    .bind(format!("0.0.0.0:{}", opt.port))?
    .run()
    .await
}
