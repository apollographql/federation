use apollo_stargate_lib::common::{Opt, TracingProtocol};
use opentelemetry::api::Provider;
use opentelemetry::sdk;
use opentelemetry::sdk::BatchSpanProcessor;
use tracing::debug;
use tracing_bunyan_formatter::{BunyanFormattingLayer, JsonStorageLayer};
use tracing_log::LogTracer;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::EnvFilter;

macro_rules! subscriber {
    ($ ( $ layer : expr , ) +) => {
        let subscriber = {
            tracing_subscriber::Registry::default()
                $(.with($layer))+
        };

        tracing::subscriber::set_global_default(subscriber)?;
    };
}

pub(crate) fn init(opts: &Opt) -> Result<(), Box<dyn std::error::Error>> {
    LogTracer::init()?;

    if let Some(tracing) = &opts.tracing_endpoint {
        debug!("initializing jaeger trace exporter");

        let mut exporter_builder =
            opentelemetry_jaeger::Exporter::builder().with_process(opentelemetry_jaeger::Process {
                service_name: String::from("stargate"),
                tags: vec![],
            });

        if tracing.protocol == TracingProtocol::UDP {
            exporter_builder = exporter_builder.with_agent_endpoint(tracing.host_port_path.clone())
        } else {
            exporter_builder = exporter_builder.with_collector_endpoint(tracing.to_string())
        }

        let exporter = BatchSpanProcessor::builder(
            exporter_builder.init()?,
            actix_web::rt::spawn,
            actix_web::rt::time::interval,
        )
        .build();

        debug!("initializing trace provider");
        let provider = sdk::Provider::builder()
            .with_batch_exporter(exporter)
            .with_config(sdk::Config {
                default_sampler: Box::new(sdk::Sampler::AlwaysOn),
                ..Default::default()
            })
            .build();

        if opts.structured_logging {
            subscriber!(
                tracing_opentelemetry::layer().with_tracer(provider.get_tracer("stargate")),
                EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
                JsonStorageLayer,
                BunyanFormattingLayer::new(String::from("stargate"), std::io::stdout),
            );
        } else {
            subscriber!(
                tracing_opentelemetry::layer().with_tracer(provider.get_tracer("stargate")),
                EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
                tracing_subscriber::fmt::layer(),
            );
        };

        debug!("setting global trace provider");
        opentelemetry::global::set_provider(provider);
    } else if opts.structured_logging {
        subscriber!(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
            JsonStorageLayer,
            BunyanFormattingLayer::new(String::from("stargate"), std::io::stdout),
        );
    } else {
        subscriber!(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
            tracing_subscriber::fmt::layer(),
        );
    }

    Ok(())
}
