use std::env::consts::OS;
use std::env::{args, var};
use std::error::Error;
use std::fs;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::mpsc;
use std::thread;
use std::time::SystemTime;

use log::debug;
use reqwest;
use semver::Version;
use serde::{Deserialize, Serialize};

use crate::errors::{ErrorDetails, ExitCode};
use crate::layout::apollo_home;

const ONE_DAY: u64 = 60 * 60 * 24;

#[derive(Debug)]
pub struct Release {
    /// version of the Apollo CLI in a release
    pub version: Version,

    /// name of the binary file contained in a release tarball
    pub archive_bin_name: String,

    /// name of the file downloaded
    pub filename: String,

    /// url of where release was fetched
    pub url: String,
}

#[derive(Debug)]
pub struct CLIVersionDiff {
    /// currently installed version of the CLI
    pub current: Version,

    /// latest version of the CLI from the worker
    pub latest: Version,

    /// set to true if the CLI version has been checked within a day
    pub checked: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct LastCheckedVersion {
    /// latest version as of last time we checked
    latest_version: String,

    /// the last time we asked the worker for the latest version
    last_checked: SystemTime,
}

impl FromStr for LastCheckedVersion {
    type Err = toml::de::Error;

    fn from_str(serialized_toml: &str) -> Result<Self, Self::Err> {
        toml::from_str(serialized_toml)
    }
}

/// Reads version out of version file, is `None` if file does not exist
fn get_version_disk(
    version_file: &PathBuf,
) -> Result<Option<LastCheckedVersion>, Box<dyn Error + 'static>> {
    let local_version = match fs::read_to_string(&version_file) {
        Ok(contents) => {
            let last_checked_version = LastCheckedVersion::from_str(&contents)?;

            Some(last_checked_version)
        }
        Err(_) => None,
    };

    Ok(local_version)
}

pub fn get_latest_release() -> Result<Release, Box<dyn Error + 'static>> {
    let platform: Option<&str> = match OS {
        "linux" | "macos" | "windows" => Some(OS),
        _ => None,
    };

    let platform = platform.ok_or(ErrorDetails::UnsupportedPlatformError {
        os: String::from(OS),
    })?;
    let domain = match var("APOLLO_CDN_URL") {
        Ok(domain) => domain.to_string(),
        Err(_) => "https://install.apollographql.com".to_string(),
    };
    let url = format!("{}/cli/{}", domain, platform);
    debug!("Fetching latest version from {}", url);
    let resp = reqwest::blocking::Client::new()
        .head(&url)
        .header("User-Agent", "Apollo CLI")
        .send()
        .map_err(|_err| ExitCode::NetworkError)
        .unwrap();

    if !resp.status().is_success() {
        debug!("Request to load the latest release");
        return Err(From::from(ErrorDetails::ReleaseFetchError));
    }

    let headers = resp.headers().clone();
    let content = headers
        .get(reqwest::header::CONTENT_DISPOSITION)
        .ok_or(ErrorDetails::ReleaseFetchError)?
        .to_str()
        .unwrap();

    if !content.contains("filename") {
        debug!(
            "No release found to install, content-distribution headers was {}",
            content
        );
        return Err(From::from(ErrorDetails::ReleaseFetchError));
    }

    // filename=ap-v0.0.0-OS.tar.gz
    // This *won't* support preleases
    let content: Vec<&str> = content.split("filename=").collect();

    let filename = content.last().ok_or(ErrorDetails::ReleaseFetchError)?;
    let archive_bin_name = filename
        .split("-")
        .nth(0)
        .ok_or(ErrorDetails::ReleaseFetchError)?;

    let file_parts: Vec<&str> = filename
        .split("v")
        .last()
        .ok_or(ErrorDetails::ReleaseFetchError)?
        .split("-")
        .collect();

    let latest_version = file_parts[0];

    Ok(Release {
        version: Version::parse(latest_version)?,
        archive_bin_name: archive_bin_name.to_string(),
        filename: filename.to_string(),
        url: url.to_string(),
    })
}

pub fn get_installed_version() -> Result<Version, Box<dyn Error + 'static>> {
    let version = option_env!("CARGO_PKG_VERSION").unwrap_or_else(|| "unknown");
    let parsed_version = Version::parse(version)?;
    Ok(parsed_version)
}

pub fn needs_updating() -> Result<CLIVersionDiff, Box<dyn Error + 'static>> {
    let config_dir = apollo_home()?;
    let version_file = config_dir.join("version.toml");
    let current_time = SystemTime::now();
    let mut checked = false;
    let current = get_installed_version()?;

    let latest = match get_version_disk(&version_file)? {
        Some(last_checked_version) => {
            let time_since_last_checked =
                current_time.duration_since(last_checked_version.last_checked)?;

            if time_since_last_checked.as_secs() < ONE_DAY {
                checked = true;
            }
            Version::parse(&last_checked_version.latest_version)?
        }
        // If version.toml doesn't exist, fetch latest version and write to file
        None => {
            let latest_version = get_latest_release()?;
            let updated_file_contents = toml::to_string(&LastCheckedVersion {
                latest_version: latest_version.version.to_string(),
                last_checked: current_time,
            })?;
            if config_dir.exists() {
                fs::write(&version_file, updated_file_contents)?;
            }
            latest_version.version
        }
    };

    Ok(CLIVersionDiff {
        latest,
        current,
        checked,
    })
}

pub fn background_check_for_updates() -> mpsc::Receiver<Version> {
    debug!("Checking to see if there is a latest version");
    let (sender, receiver) = mpsc::channel();

    // don't check for updates if APOLLO_UPDATE_CHECK_DISABLED is set
    if var("APOLLO_UPDATE_CHECK_DISABLED").is_ok() {
        return receiver;
    }

    let _detached_thread = thread::spawn(move || match needs_updating() {
        Ok(versions) => {
            if !versions.checked && (versions.latest > versions.current) {
                let _ = sender.send(versions.latest);
            }
        }
        Err(e) => debug!("Failed to determined if new updated was needed:\n{}", e),
    });
    receiver
}

// per the docs on std::env::arg
// The first element is traditionally the path of the executable, but it can be set to
// arbitrary text, and may not even exist. This means this property should not be
// relied upon for security purposes.
pub fn command_name() -> std::string::String {
    args()
        .next()
        .expect("Called help without a path to the binary")
}

#[cfg(test)]
mod tests {

    use std::env::consts::OS;
    use std::env::set_var;
    use std::error::Error;

    use tempfile::tempdir;
    use wiremock::matchers::{method, PathExactMatcher};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    use super::*;

    async fn create_mock_proxy(
        response: ResponseTemplate,
        times: u64,
    ) -> Result<MockServer, Box<dyn Error + 'static>> {
        let proxy = MockServer::start().await;
        let platform: Option<&str> = match OS {
            "linux" | "macos" | "windows" => Some(OS),
            _ => None,
        };

        Mock::given(method("HEAD"))
            .and(PathExactMatcher::new(format!("cli/{}", platform.unwrap())))
            .respond_with(response)
            .expect(times)
            .mount(&proxy)
            .await;

        Ok(proxy)
    }

    // environment variables are a shared resource on the thread so we combine these tests
    // together to prevent url clobbering
    #[async_std::test]
    async fn background_updates() -> Result<(), Box<dyn std::error::Error>> {
        let dir = tempdir().unwrap();
        set_var("HOME", dir.path());
        let apollo_home = dir.path().join(".apollo");
        fs::create_dir(&apollo_home)?;
        dbg!(dir.path());

        // return_latest_release_from_thread()
        {
            let response = ResponseTemplate::new(200)
                .append_header("content-disposition", "filename=ap-v100.0.0-linux");
            let proxy = create_mock_proxy(response, 1).await.unwrap();
            set_var("APOLLO_CDN_URL", &proxy.uri());

            let receiver = background_check_for_updates();
            let latest_version = receiver.recv().unwrap();
            assert_eq!(Version::parse("100.0.0").unwrap(), latest_version);
        }

        // returns_nothing_from_thread_if_not_new()
        {
            fs::remove_file(&apollo_home.join("version.toml"))?;
            let response = ResponseTemplate::new(200)
                .append_header("content-disposition", "filename=ap-v0.0.1-linux");

            let proxy = create_mock_proxy(response, 1).await.unwrap();
            set_var("APOLLO_CDN_URL", &proxy.uri());

            let receiver = background_check_for_updates();
            assert_eq!(receiver.recv().is_err(), true);
        }

        // does_not_check_if_checked_recently()
        {
            let response = ResponseTemplate::new(200)
                .append_header("content-disposition", "filename=ap-v0.0.1-linux");

            let proxy = create_mock_proxy(response, 0).await.unwrap();
            set_var("APOLLO_CDN_URL", &proxy.uri());

            let receiver = background_check_for_updates();
            assert_eq!(receiver.recv().is_err(), true);
        }

        // does_not_fetch_if_disabled()
        {
            let response = ResponseTemplate::new(200)
                .append_header("content-disposition", "filename=ap-v0.0.1-linux");

            let proxy = create_mock_proxy(response, 0).await.unwrap();
            set_var("APOLLO_CDN_URL", &proxy.uri());
            set_var("APOLLO_UPDATE_CHECK_DISABLED", "1");

            let receiver = background_check_for_updates();
            assert_eq!(receiver.recv().is_err(), true);
        }

        Ok(())
    }
}
