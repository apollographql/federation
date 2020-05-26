use std::env;
use std::env::consts::OS;
use std::env::current_dir;
use std::error::Error;
use std::time::Duration;

use ci_info;
use log::debug;
use reqwest;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::config::CliConfig;
use crate::version::get_installed_version;

#[derive(Debug, Serialize, Deserialize)]
pub struct Platform {
    /// the platform from which the command was run (i.e. linux, macOS, or windows)
    os: String,

    /// if we think this command is being run in a CLI
    is_ci: bool,

    /// the name of the CI we think is being used
    ci_name: Option<String>,
}

/// The Session represents a usage of the CLI analogous to a web session
/// It contains the "url" (command path + flags) but doesn't contain any
/// values entered by the user. It also contains some identity information
/// for the user
#[derive(Debug, Serialize, Deserialize)]
pub struct Session {
    /// the command usage where commands are paths and flags are query strings
    /// i.e. ap schema push --graph --variant would become ap/schema/push?graph&variant
    command: Option<String>,

    /// Apollo generated machine ID. This is a UUID and stored globally at ~/.apollo/config.toml
    machine_id: String,

    /// A unique session id
    session_id: String,

    /// Directory hash. A hash of the current working directory
    cwd_hash: String,

    /// Information about the current architecture/platform
    platform: Platform,

    /// The current version of the CLI
    release_version: String,
}

fn get_cwd_hash() -> String {
    let current_dir = current_dir().unwrap();
    format!(
        "{:x}",
        Sha256::digest(current_dir.to_str().unwrap().as_bytes())
    )
}

impl Session {
    pub fn init() -> Result<Session, Box<dyn Error + 'static>> {
        let command = None;
        let machine_id = CliConfig::load()?.machine_id;
        let session_id = Uuid::new_v4().to_string();
        let cwd_hash = get_cwd_hash();

        let platform = Platform {
            os: OS.to_string(),
            is_ci: ci_info::is_ci(),
            ci_name: ci_info::get().name,
        };

        let release_version = get_installed_version()?.to_string();
        ::log::debug!("hash: {}, id: {}", cwd_hash, machine_id);
        Ok(Session {
            command,
            machine_id,
            session_id,
            cwd_hash,
            platform,
            release_version,
        })
    }

    pub fn log_command(&mut self, cmd: &str) {
        self.command = Some(cmd.to_string())
    }

    pub fn report(&self) -> Result<bool, Box<dyn Error + 'static>> {
        // don't send if APOLLO_TELEMETRY_DISABLED is set
        if env::var("APOLLO_TELEMETRY_DISABLED").is_ok() {
            return Ok(false);
        }
        let domain = match env::var("APOLLO_CDN_URL") {
            Ok(domain) => domain.to_string(),
            Err(_) => "https://install.apollographql.com".to_string(),
        };
        let url = format!("{}/telemetry", domain);
        let body = serde_json::to_string(&self).unwrap();
        // keep the CLI waiting for 300 ms to send telemetry
        // if the request isn't sent in that time loose that report
        // to keep the experience fast for end users
        let timeout = Duration::from_millis(300);
        debug!("Sending telemetry to {}", &url);
        let resp = reqwest::blocking::Client::new()
            .post(&url)
            .body(body)
            .header("User-Agent", "Apollo CLI")
            .header("Content-Type", "application/json")
            .timeout(timeout)
            .send();

        debug!("Telemetry request done");
        match resp {
            Ok(res) => Ok(res.status().is_success()),
            Err(_e) => Ok(false),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::env::set_var;

    use wiremock::matchers::{method, PathExactMatcher};
    use wiremock::{Mock, MockServer, Request, ResponseTemplate};

    use super::Session;

    #[async_std::test]
    async fn reports_session() -> Result<(), Box<dyn std::error::Error>> {
        // create a session
        let mut session = Session::init()?;
        session.log_command("test");

        let proxy = MockServer::start().await;

        let payload_matcher = move |request: &Request| {
            let body: Session =
                serde_json::from_slice(&request.body).expect("Failed to serialise body");
            match body.command {
                Some(cmd) => cmd == "test".to_string(),
                None => false,
            }
        };

        Mock::given(method("POST"))
            .and(PathExactMatcher::new("/telemetry"))
            .and(payload_matcher)
            .respond_with(ResponseTemplate::new(200))
            .expect(1)
            .mount(&proxy)
            .await;

        set_var("APOLLO_CDN_URL", &proxy.uri());
        assert_eq!(session.report()?, true);

        // the mock will panic if it this report is sent
        set_var("APOLLO_TELEMETRY_DISABLED", "1");
        assert_eq!(session.report()?, false);

        Ok(())
    }
}
