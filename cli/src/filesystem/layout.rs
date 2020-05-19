use std::path::PathBuf;

use crate::errors::{ErrorDetails, Fallible};

// ~/
//     .apollo/
//         bin/
//             ap
//             apollo-language-server
//         atlas/
//         config.toml

pub fn apollo_home() -> Fallible<PathBuf> {
    let home = dirs::home_dir().ok_or(ErrorDetails::NoHomeEnvironmentVar)?;
    Ok(home.join(".apollo"))
}

pub fn apollo_home_bin() -> Fallible<PathBuf> {
    let home = apollo_home()?;
    Ok(home.join("bin"))
}

pub fn apollo_config() -> Fallible<PathBuf> {
    let home = apollo_home()?;
    Ok(home.join("config.toml"))
}
