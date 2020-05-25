use std::env::consts::OS;
use std::env::{args, var};
use std::error::Error;
use std::sync::mpsc;
use std::thread;

use log::debug;
use reqwest;
use semver::Version;

use crate::errors::{ErrorDetails, ExitCode};

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
    /// currently installed version of wrangler
    pub current: Version,

    /// latest version of wrangler on crates.io
    pub latest: Version,
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
    let latest_release = get_latest_release()?;
    let current = get_installed_version()?;

    Ok(CLIVersionDiff {
        latest: latest_release.version,
        current,
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
            if versions.latest > versions.current {
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
        // return_latest_release_from_thread()
        {
            let response = ResponseTemplate::new(200)
                .append_header("content-disposition", "filename=ap-v100.0.0-linux");
            let proxy = create_mock_proxy(response, 1).await.unwrap();
            dbg!(proxy.uri());
            set_var("APOLLO_CDN_URL", &proxy.uri());

            let receiver = background_check_for_updates();
            if let Ok(latest_version) = receiver.recv() {
                assert_eq!(Version::parse("100.0.0").unwrap(), latest_version);
            } else {
                panic!("No version reported from thread");
            }
        }

        // returns_nothing_from_thread_if_not_new()
        {
            let response = ResponseTemplate::new(200)
                .append_header("content-disposition", "filename=ap-v0.0.1-linux");

            let proxy = create_mock_proxy(response, 1).await.unwrap();
            dbg!(&proxy.uri());
            set_var("APOLLO_CDN_URL", &proxy.uri());

            let receiver = background_check_for_updates();
            assert_eq!(receiver.recv().is_err(), true);
        }

        // does_not_fetch_if_disabled()
        {
            let response = ResponseTemplate::new(200)
                .append_header("content-disposition", "filename=ap-v0.0.1-linux");

            let proxy = create_mock_proxy(response, 0).await.unwrap();
            dbg!(&proxy.uri());
            set_var("APOLLO_CDN_URL", &proxy.uri());
            set_var("APOLLO_UPDATE_CHECK_DISABLED", "1");

            let receiver = background_check_for_updates();
            assert_eq!(receiver.recv().is_err(), true);
        }

        Ok(())
    }
}
