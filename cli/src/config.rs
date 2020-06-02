use std::error::Error;
use std::fs;

use crate::errors::{ApolloError, ErrorDetails, Fallible};
use config::{Config, Environment};
use log::{debug, info};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use std::path::PathBuf;

const POST_INSTALL_MESSAGE: &str = "
Apollo collects anonymous usage analytics to help improve the Apollo CLI for all users.

If you'd like to opt-out, set the APOLLO_TELEMETRY_DISABLE=true
To learn more, checkout https://apollo.dev/cli/telemetry\n";

#[derive(Debug, Serialize, Deserialize)]
pub struct CliConfig {
    pub machine_id: String,
    // This can be used for a service api key, or a personal api key.
    // The CLI doesn't differentiate at the moment.
    pub api_key: Option<String>,
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

    s.merge(config::File::with_name(path.to_str().unwrap()))?;

    s.merge(Environment::with_prefix("APOLLO_").separator("__"))
        .unwrap();

    debug!("Loading cli config from path {}...", path.to_str().unwrap());
    s.try_into().map_err(From::from)
}

impl CliConfig {
    pub fn save(path: &PathBuf, cli_config: &CliConfig) -> Fallible<()> {
        save(path, cli_config).map_err(|e| {
            ApolloError::from(ErrorDetails::CliConfigWriteError {
                msg: e.to_string(),
                path: path.to_str().unwrap().to_string(),
            })
        })
    }

    pub fn create(path: &PathBuf) -> Result<Self, Box<dyn Error + 'static>> {
        let config = CliConfig {
            machine_id: Uuid::new_v4().to_string(),
            api_key: None,
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
            ApolloError::from(ErrorDetails::CliConfigReadError {
                msg: e.to_string(),
                path: path.to_str().unwrap().to_string(),
            })
        })
    }
}

impl Clone for CliConfig {
    fn clone(&self) -> CliConfig {
        CliConfig {
            machine_id: self.machine_id.clone(),
            api_key: self.api_key.clone(),
        }
    }
}

// #[cfg(test)]
// mod tests {
//     use std::env::set_var;
//     use tempfile::tempdir;

//     use super::CliConfig;

//     // environment variables are a shared resource on the thread so we combine these tests
//     // together to prevent env clobbering
//     #[test]
//     fn creates_machine_id_or_reads_it() -> Result<(), Box<dyn std::error::Error>> {
//         let dir = tempdir().unwrap();
//         set_var("HOME", dir.path());
//         dbg!(dir.path());
//         // write new config to $HOME
//         let config = CliConfig::load()?;
//         assert_ne!(config.machine_id.is_empty(), true);
//         dbg!(std::env::var("HOME").unwrap());
//         // read config
//         let config_two = CliConfig::load()?;
//         assert_eq!(config.machine_id, config_two.machine_id);

//         Ok(())
//     }
// }
