use log::info;
use structopt::StructOpt;

use crate::commands::Command;
use crate::errors::{ExitCode, Fallible};
use crate::style;
use crate::telemetry::Session;

#[derive(StructOpt)]
pub struct Setup {}

impl Command for Setup {
    fn run(&self, session: &mut Session) -> Fallible<ExitCode> {
        session.log_command("setup");
        os::setup_environment()?;

        info!(
            "{} Setup complete. Open a new terminal to start using the Apollo CLI!",
            style::ROCKET
        );

        Ok(ExitCode::Success)
    }
}

#[cfg(unix)]
mod os {
    use std::env;
    use std::fs::File;
    use std::io::{self, BufRead, BufReader, Write};
    use std::path::{Path, PathBuf};

    use log::{debug, warn};

    use crate::errors::{ErrorDetails, Fallible};
    use crate::filesystem::layout::apollo_home_bin;
    use crate::version::command_name;

    pub fn setup_environment() -> Fallible<()> {
        debug!("Searching for profiles to update");
        let profiles = determine_profiles()?;

        let found_profile = profiles.into_iter().fold(false, |prev, profile| {
            let contents = read_profile_without_apollo(&profile).unwrap_or_else(String::new);

            let write_profile = match profile.extension() {
                Some(ext) if ext == "fish" => write_profile_fish,
                _ => write_profile_sh,
            };

            match write_profile(&profile, contents) {
                Ok(()) => {
                    debug!("Wrote $PATH addition into {}", profile.display());
                    true
                }
                Err(err) => {
                    warn!(
                        "Found profile script, but could not modify it: {}",
                        profile.display()
                    );
                    debug!("Profile modification error: {}", err);
                    prev
                }
            }
        });

        if found_profile {
            Ok(())
        } else {
            Err(ErrorDetails::NoShellProfile {
                env_profile: String::new(),
                bin_dir: apollo_home_bin()?.to_owned(),
            }
            .into())
        }
    }

    fn determine_profiles() -> Fallible<Vec<PathBuf>> {
        let user_home_dir = dirs::home_dir().ok_or(ErrorDetails::NoHomeEnvironmentVar)?;
        let shell = env::var("SHELL").unwrap_or_else(|_| String::new());
        let mut profiles = Vec::new();

        // Always include `~/.profile`
        profiles.push(user_home_dir.join(".profile"));

        // PROFILE environment variable, if set
        if let Ok(profile_env) = env::var("PROFILE") {
            if !profile_env.is_empty() {
                profiles.push(profile_env.into());
            }
        }

        if shell.contains("zsh") {
            let zshrc = user_home_dir.join(".zshrc");
            if zshrc.exists() {
                profiles.push(zshrc)
            }
        } else if shell.contains("fish") {
            let fish_config = user_home_dir.join(".config/fish/config.fish");
            if fish_config.exists() {
                profiles.push(fish_config)
            }
        } else if shell.contains("bash") {
            let bashrc = user_home_dir.join(".bashrc");
            let bash_profile = user_home_dir.join(".bash_profile");

            match (bashrc.exists(), bash_profile.exists()) {
                (true, true) | (true, false) => {
                    profiles.push(bashrc);
                }
                (false, true) => {
                    profiles.push(bash_profile);
                }
                (false, false) => {
                    let suggested_bash_profile = if cfg!(target_os = "macos") {
                        "~/.bash_profile"
                    } else {
                        "~/.bashrc"
                    };

                    warn!(
                        "It looks like you are using bash but we couldn't find any bash profile scripts.
If you run into problems running the Apollo CLI, create {} and run `{} setup` again.",
                        suggested_bash_profile, command_name()
                    );
                }
            }
        }

        Ok(profiles)
    }

    fn read_profile_without_apollo(path: &Path) -> Option<String> {
        let file = File::open(path).ok()?;
        let reader = BufReader::new(file);

        reader
            .lines()
            .filter(|line_result| match line_result {
                Ok(line) if !line.contains(".apollo/bin") => true,
                Ok(_) => false,
                Err(_) => true,
            })
            .collect::<io::Result<Vec<String>>>()
            .map(|lines| lines.join("\n"))
            .ok()
    }

    fn write_profile_sh(path: &Path, contents: String) -> io::Result<()> {
        let mut file = File::create(path)?;
        write!(
            file,
            "{}\nexport PATH=\"$HOME/.apollo/bin:$PATH\"\n",
            contents,
        )
    }

    fn write_profile_fish(path: &Path, contents: String) -> io::Result<()> {
        let mut file = File::create(path)?;
        write!(
            file,
            "{}\nset -gx PATH \"$HOME/.apollo/bin\" $PATH\n",
            contents,
        )
    }
}

#[cfg(windows)]
mod os {
    use crate::errors::{ErrorDetails, Fallible};
    use crate::layout::apollo_home_bin;
    use log::debug;
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    pub fn setup_environment() -> Fallible<()> {
        let bin_dir = apollo_home_bin()?.to_string_lossy().to_string();
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);

        let env = hkcu
            .open_subkey("Environment")
            .map_err(|_e| ErrorDetails::ReadUserPathError)?;

        let path: String = env
            .get_value("Path")
            .map_err(|_e| ErrorDetails::ReadUserPathError)?;

        if !path.contains(&bin_dir) {
            let (key, _disp) = hkcu
                .create_subkey("Environment")
                .map_err(|_e| ErrorDetails::ReadUserPathError)?;

            debug!("Adding {} to Path", &bin_dir);
            key.set_value("Path", &format!("{};{}", bin_dir, path).to_string())
                .map_err(|_e| ErrorDetails::WriteUserPathError)?;
        }

        Ok(())
    }
}
