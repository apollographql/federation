use std::error::Error;
use std::fs;

use crate::errors::{ErrorDetails, Fallible};
use config::Config;
use log::{debug, info};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use std::path::PathBuf;

static PROD_GQL_API_URL: &str = "https://engine-graphql.apollographql.com/api/graphql";

static POST_INSTALL_MESSAGE: &str = "
Apollo collects anonymous usage analytics to help improve the Apollo CLI for all users.

If you'd like to opt-out, set APOLLO_TELEMETRY_DISABLED=true
To learn more, checkout https://apollo.dev/cli/telemetry\n";

#[derive(Debug, Serialize, Deserialize)]
pub struct CliConfig {
    pub machine_id: String,
    // This can be used for a service api key, or a personal api key.
    // The CLI doesn't differentiate at the moment.
    pub api_key: Option<String>,
    pub api_url: Option<String>,
}

fn save(path: &PathBuf, cli_config: &CliConfig) -> Result<(), Box<dyn Error + 'static>> {
    let toml = toml::to_string(cli_config).unwrap();

    fs::create_dir_all(&path.parent().unwrap())?;
    debug!("Writing cli config to path {}...", path.to_str().unwrap());
    fs::write(&path, toml).map_err(From::from)
}

fn load(path: &PathBuf) -> Result<CliConfig, Box<dyn Error + 'static>> {
    let mut s = Config::new();

    if !path.exists() {
        CliConfig::create(path)?;
    }

    let mut s_defaults = Config::new();
    s_defaults.set("api_url", PROD_GQL_API_URL)?;

    s.merge(s_defaults)?;

    s.merge(config::File::with_name(path.to_str().unwrap()))?;

    s.merge(config::Environment::with_prefix("APOLLO_").separator("__"))
        .unwrap();

    debug!("Loading cli config from path {}...", path.to_str().unwrap());
    s.try_into().map_err(From::from)
}

impl CliConfig {
    pub fn save(path: &PathBuf, cli_config: &CliConfig) -> Fallible<()> {
        save(path, cli_config).map_err(|e| {
            ErrorDetails::CliConfigWriteError {
                msg: e.to_string(),
                path: path.to_str().unwrap().to_string(),
            }
            .into()
        })
    }

    pub fn create(path: &PathBuf) -> Result<Self, Box<dyn Error + 'static>> {
        let config = CliConfig {
            machine_id: Uuid::new_v4().to_string(),
            api_key: None,
            api_url: None,
        };

        debug!(
            "New cli config: {}",
            serde_json::to_string(&config).unwrap()
        );

        CliConfig::save(path, &config)?;

        // log initial telemetry warning
        info!("{}", POST_INSTALL_MESSAGE);
        Ok(config)
    }

    pub fn load(path: &PathBuf) -> Fallible<Self> {
        load(path).map_err(|e| {
            ErrorDetails::CliConfigReadError {
                msg: e.to_string(),
                path: path.to_str().unwrap().to_string(),
            }
            .into()
        })
    }
}
