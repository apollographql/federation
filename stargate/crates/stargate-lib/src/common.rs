use std::fmt::{Display, Formatter};
use std::path::PathBuf;
use std::str::FromStr;
use structopt::StructOpt;
use url::Url;

#[derive(Debug, StructOpt, PartialEq)]
#[structopt(
    name = "stargate",
    about = "A production ready federation server from Apollo"
)]
pub struct Opt {
    /// Manifest CSDL
    #[structopt(long, parse(from_os_str))]
    pub manifest: PathBuf,

    /// The port to bind on
    #[structopt(default_value = "8080", short = "p", long)]
    pub port: u32,

    /// If enabled, logs will be outputed as JSON in the Bunyan Format. Defaults to false.
    #[structopt(short, long)]
    pub structured_logging: bool,

    /// Endpoint url to send traces to (Jaeger format).
    /// Setting this argument enables tracing.
    /// Accepts [http|udp]://host:port/path (path is optional)
    #[structopt(short, long)]
    pub tracing_endpoint: Option<TracingConfig>,

    /// A space separated list of header names which Stargate should propagate to implementing services.
    /// Headers are automatically lowercased.
    #[structopt(long, parse(from_str = parse_header))]
    pub propagate_request_headers: Vec<String>,
}

fn parse_header(header: &str) -> String {
    header.to_lowercase()
}

impl Opt {
    pub fn pretty_print(&self) -> String {
        let mut buf = String::new();
        buf.push_str("manifest: ");
        buf.push_str(self.manifest.to_str().unwrap());
        buf.push('\n');

        buf.push_str("port: ");
        buf.push_str(self.port.to_string().as_str());
        buf.push('\n');

        buf.push_str("structured_logging: ");
        buf.push_str(self.structured_logging.to_string().as_str());
        buf.push('\n');

        if let Some(ref tracing_endpoint) = self.tracing_endpoint {
            buf.push_str("tracing: ");
            buf.push_str(tracing_endpoint.to_string().as_str());
        } else {
            buf.push_str("tracing: disabled");
        }
        buf.push('\n');

        if !self.propagate_request_headers.is_empty() {
            buf.push_str("headers:\n");
            for header in self.propagate_request_headers.iter() {
                buf.push_str(format!("  * {}\n", header).as_str());
            }
        } else {
            buf.push_str("header propagation: disabled");
        }
        buf.push('\n');

        buf.push_str("structured_logging: ");
        buf.push_str(self.structured_logging.to_string().as_str());
        buf.push('\n');

        buf
    }
}

#[derive(Debug, PartialEq)]
pub struct TracingConfig {
    pub protocol: TracingProtocol,
    pub host_port_path: String,
}

impl Display for TracingConfig {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str(&format!("{:?}://{}", self.protocol, self.host_port_path).to_lowercase())
    }
}

// TODO(ran) support HTTPS
// TODO(ran) support UDS ?
#[derive(Debug, PartialEq)]
pub enum TracingProtocol {
    HTTP,
    UDP,
}

impl FromStr for TracingConfig {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let err = || {
            String::from("endpoint must be in the format of [http|udp]://[host]:[port]/path (path is optional)")
        };
        match Url::parse(s) {
            Err(e) => Err(e.to_string()),
            Ok(url) => {
                if (url.scheme() != "http" && url.scheme() != "udp")
                    || url.port().is_none()
                    || url.host_str().is_none()
                {
                    Err(err())
                } else {
                    let protocol = if url.scheme() == "udp" {
                        TracingProtocol::UDP
                    } else {
                        TracingProtocol::HTTP
                    };

                    let mut host_port_path =
                        format!("{}:{}", url.host_str().unwrap(), url.port().unwrap());
                    if url.path() != "/" {
                        host_port_path.push_str(url.path());
                    }

                    Ok(TracingConfig {
                        protocol,
                        host_port_path,
                    })
                }
            }
        }
    }
}

impl Default for Opt {
    fn default() -> Self {
        Opt::from_args()
    }
}

#[cfg(test)]
mod tests {
    use crate::common::{Opt, TracingConfig, TracingProtocol};
    use std::path::PathBuf;
    use structopt::StructOpt;

    #[test]
    fn test_good_opt() {
        assert_eq!(
            Opt::from_iter("test --manifest foo.graphql".split(' ')),
            Opt {
                manifest: PathBuf::from("foo.graphql"),
                structured_logging: false,
                port: 8080,
                tracing_endpoint: None,
                propagate_request_headers: vec![]
            }
        );

        assert_eq!(
            Opt::from_iter(
                "test --manifest foo.graphql --structured-logging --port 8181".split(' ')
            ),
            Opt {
                manifest: PathBuf::from("foo.graphql"),
                structured_logging: true,
                port: 8181,
                tracing_endpoint: None,
                propagate_request_headers: vec![]
            }
        );

        assert_eq!(
            Opt::from_iter(
                "test --manifest foo.graphql --tracing-endpoint udp://localhost:6831".split(' ')
            ),
            Opt {
                manifest: PathBuf::from("foo.graphql"),
                structured_logging: false,
                port: 8080,
                tracing_endpoint: Some(TracingConfig {
                    protocol: TracingProtocol::UDP,
                    host_port_path: String::from("localhost:6831")
                }),
                propagate_request_headers: vec![]
            }
        );

        assert_eq!(
            Opt::from_iter(
                "test --manifest foo.graphql --tracing-endpoint http://localhost:6831".split(' ')
            ),
            Opt {
                manifest: PathBuf::from("foo.graphql"),
                structured_logging: false,
                port: 8080,
                tracing_endpoint: Some(TracingConfig {
                    protocol: TracingProtocol::HTTP,
                    host_port_path: String::from("localhost:6831")
                }),
                propagate_request_headers: vec![]
            }
        );

        assert_eq!(
            Opt::from_iter(
                "test --manifest foo.graphql --tracing-endpoint http://localhost:14268/api/traces"
                    .split(' ')
            ),
            Opt {
                manifest: PathBuf::from("foo.graphql"),
                structured_logging: false,
                port: 8080,
                tracing_endpoint: Some(TracingConfig {
                    protocol: TracingProtocol::HTTP,
                    host_port_path: String::from("localhost:14268/api/traces")
                }),
                propagate_request_headers: vec![]
            }
        );

        assert_eq!(
            Opt::from_iter(
                "test --manifest foo.graphql --propagate-request-headers CHECK loweRcAsE and-names with_symBolS -p 1234"
                    .split(' ')
            ),
            Opt {
                manifest: PathBuf::from("foo.graphql"),
                structured_logging: false,
                port: 1234,
                tracing_endpoint: None,
                propagate_request_headers: vec![
                    String::from("check"),
                    String::from("lowercase"),
                    String::from("and-names"),
                    String::from("with_symbols"),
                ]
            }
        );
    }

    #[test]
    fn test_bad_opts() {
        assert!(Opt::from_iter_safe(
            "test --manifest foo.graphql --tracing-endpoint localhost:6831".split(' '),
        )
        .is_err());

        assert!(Opt::from_iter_safe(
            "test --manifest foo.graphql --tracing-endpoint udf://localhost:6831".split(' '),
        )
        .is_err());
        assert!(Opt::from_iter_safe(
            "test --manifest foo.graphql --tracing-endpoint https://localhost:6831".split(' '),
        )
        .is_err());
    }
}
