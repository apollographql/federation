use std::env;
use std::env::consts::OS;
use std::fs::{set_permissions, DirBuilder, File, metadata};
#[cfg(not(windows))]
use std::os::unix::fs::PermissionsExt;

use log::{debug, info, warn};
use reqwest::{self, header};
use semver::Version;
use structopt::StructOpt;
use tempfile::tempdir;

use crate::commands::Command;
use crate::errors::{ErrorDetails, ExitCode, Fallible};
use crate::filesystem::{Download, Extract, Move};
use crate::style;
use crate::terminal::confirm;

#[derive(StructOpt)]
pub struct Update {}

impl Command for Update {
    fn run(&self) -> Fallible<ExitCode> {
        info!("{} Checking for the latest version...", style::ROCKET);

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

        let file_parts: Vec<&str> = filename
            .split("v")
            .last()
            .ok_or(ErrorDetails::ReleaseFetchError)?
            .split("-")
            .collect();

        let latest_version = file_parts[0];
        let current_version = env!("CARGO_PKG_VERSION");

        debug!(
            "Comparing installed version {} with latest version {}",
            current_version, latest_version
        );

        if Version::parse(latest_version) <= Version::parse(current_version) {
            info!(
                "{} You are already up to date with the latest version!",
                style::TADA
            );
            return Ok(ExitCode::Success);
        }

        info!("\nApollo CLI release status:");
        info!("  * Current version: {:?}", current_version);
        info!("  * New version: {:?}", latest_version);
        info!("\nThe new release will be downloaded/extracted and the existing binary will be replaced.");

        let confirmed = confirm("Do you want to continue?")?;

        if !confirmed {
            warn!("Did not update the Apollo CLI!");
            return Ok(ExitCode::Success);
        }
        let tmp_dir_parent = tempdir().unwrap();

        let bin_name = env::args()
            .next()
            .expect("Could not determine name of executable");

        let tmp_dir = tmp_dir_parent.path().join(&format!("{}_download", bin_name));
        DirBuilder::new().recursive(true).create(&tmp_dir).unwrap();

        let tmp_archive_path = tmp_dir.join(&filename);
        debug!("Creating archive path {}", tmp_archive_path.to_string_lossy());

        let mut tmp_archive =
            File::create(&tmp_archive_path).map_err(|e| ErrorDetails::CLIInstallError { msg: e.to_string() })?;

        info!("Downloading latest build...");
        let mut download = Download::from_url(&url);
        let mut headers = header::HeaderMap::new();
        headers.insert(header::ACCEPT, "application/octect-stream".parse().unwrap());
        download.set_headers(headers);
        download.show_progress(true);

        download.download_to(&mut tmp_archive).unwrap();
        debug!(
            "Downloaded newest release to {}. Starting to extract tarball",
            tmp_archive_path.to_string_lossy()
        );

        Extract::from_source(&tmp_archive_path)
            .extract_file(&tmp_dir, "dist/ap")
            .map_err(|e| ErrorDetails::CLIInstallError { msg: e.to_string() })?;

        let new_exe = tmp_dir.join("dist/ap");
        // Make executable
        #[cfg(not(windows))]
        {
            let mut permissions = metadata(&new_exe).unwrap().permissions();
            permissions.set_mode(0o755);
            set_permissions(&new_exe, permissions).unwrap();
        }

        let bin_install_path = env::current_exe().unwrap();

        debug!("Replacing binary file with executable from {} into {}", new_exe.to_string_lossy(), bin_install_path.to_string_lossy());
        let tmp_file = tmp_dir.join(&format!("__{}_backup", "ap"));
        Move::from_source(&new_exe)
            .replace_using_temp(&tmp_file)
            .to_dest(&bin_install_path)
            .map_err(|e| ErrorDetails::CLIInstallError { msg: e.to_string() })?;

        info!("{} Succesfully updated to the latest Apollo CLI. Enjoy!", style::ROCKET);
        Ok(ExitCode::Success)
    }
}