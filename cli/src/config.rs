use std::error::Error;
use std::fs;

use serde::{Serialize, Deserialize};
use config::{ConfigError, Config};
use uuid::Uuid;

use crate::filesystem::layout::apollo_config;

#[derive(Debug, Serialize, Deserialize)]
pub struct CliConfig {
    pub machine_id: String
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
            
        }

        s.try_into().map_err(|e| From::from(e))
    }
}