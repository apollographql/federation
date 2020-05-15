use std::env::consts::OS;
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
    let url = format!("https://install.apollographql.com/cli/{}", platform);
    debug!("Fetching latest version from {}", url);
    let resp = reqwest::blocking::Client::new()
        .head(&url)
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
    let (sender, receiver) = mpsc::channel();

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
