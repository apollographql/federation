use std::error::Error;
use std::fs;

use config::{Config, ConfigError};
use log::info;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::layout::apollo_config;

const POST_INSTALL_MESSAGE: &str = "
Apollo collects anonymous usage analytics to help improve the Apollo CLI for all users.

If you'd like to opt-out, set the APOLLO_TELEMETRY_DISABLE=true
To learn more, checkout https://apollo.dev/cli/telemetry\n";

#[derive(Debug, Serialize, Deserialize)]
pub struct CliConfig {
    pub machine_id: String,
}

impl CliConfig {
    pub fn load() -> Result<Self, Box<dyn Error + 'static>> {
        let mut s = Config::new();

        let config_path = apollo_config().unwrap();

        if config_path.exists() {
            s.merge(config::File::with_name(config_path.to_str().unwrap()))?;
        } else {
            // create new file with uuid
            let machine_id = Uuid::new_v4().to_string();
            s.set("machine_id", machine_id)?;

            let generated: Result<CliConfig, ConfigError> = s.clone().try_into();

            let toml = toml::to_string(&generated.unwrap()).unwrap();

            fs::create_dir_all(&config_path.parent().unwrap())?;
            fs::write(&config_path, toml)?;

            // log initial telemetry warning
            info!("{}", POST_INSTALL_MESSAGE);
        }

        s.try_into().map_err(From::from)
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
