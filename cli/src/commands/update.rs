use std::env;
use std::env::consts::EXE_SUFFIX;
use std::fs::{metadata, set_permissions, DirBuilder, File};
#[cfg(not(windows))]
use std::os::unix::fs::PermissionsExt;

use log::{debug, info, warn};
use reqwest::{self, header};
use structopt::StructOpt;
use tempfile::tempdir;

use crate::commands::Command;
use crate::errors::{ErrorDetails, ExitCode, Fallible};
use crate::style;
use crate::telemetry::Session;
use crate::terminal::confirm;
use crate::version::{get_installed_version, get_latest_release, Release};
use self_update::{Download, Extract, Move};

#[derive(StructOpt)]
pub struct Update {}

impl Command for Update {
    fn run(&self, session: &mut Session) -> Fallible<ExitCode> {
        session.log_command("update");
        info!("{} Checking for the latest version...", style::ROCKET);

        let Release {
            version: latest_version,
            archive_bin_name,
            filename,
            url,
        } = get_latest_release()
            .map_err(|e| ErrorDetails::CLIInstallError { msg: e.to_string() })?;
        let current_version = get_installed_version()
            .map_err(|e| ErrorDetails::CLIInstallError { msg: e.to_string() })?;

        debug!(
            "Comparing installed version {} with latest version {}",
            current_version, latest_version
        );

        if latest_version <= current_version {
            info!(
                "{} You are already up to date with the latest version!",
                style::TADA
            );
            return Ok(ExitCode::Success);
        }

        info!("\nApollo CLI release status:");
        info!("  * Current version: {:?}", current_version.to_string());
        info!("  * New version: {:?}", latest_version.to_string());
        info!("\nThe new release will be downloaded/extracted and the existing binary will be replaced.");

        let confirmed = confirm("Do you want to continue?")?;

        if !confirmed {
            warn!("Did not update the Apollo CLI!");
            return Ok(ExitCode::Success);
        }
        let tmp_dir_parent = tempdir().unwrap();

        let bin_name = format!(
            "{}{}",
            env::args()
                .next()
                .expect("Could not determine name of executable"),
            EXE_SUFFIX
        );

        let tmp_dir = tmp_dir_parent
            .path()
            .join(&format!("{}_download", bin_name));
        DirBuilder::new().recursive(true).create(&tmp_dir).unwrap();

        let tmp_archive_path = tmp_dir.join(&filename);
        debug!(
            "Creating archive path {}",
            tmp_archive_path.to_string_lossy()
        );

        let mut tmp_archive = File::create(&tmp_archive_path)
            .map_err(|e| ErrorDetails::CLIInstallError { msg: e.to_string() })?;

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

        let archive_bin_path = format!("dist/{}{}", archive_bin_name, EXE_SUFFIX);
        Extract::from_source(&tmp_archive_path)
            .extract_file(&tmp_dir, &archive_bin_path)
            .map_err(|e| ErrorDetails::CLIInstallError { msg: e.to_string() })?;

        let new_exe = tmp_dir.join(&archive_bin_path);
        // Make executable
        #[cfg(not(windows))]
        {
            let mut permissions = metadata(&new_exe).unwrap().permissions();
            permissions.set_mode(0o755);
            set_permissions(&new_exe, permissions).unwrap();
        }

        let bin_install_path = env::current_exe().unwrap();

        debug!(
            "Replacing binary file with executable from {} into {}",
            new_exe.to_string_lossy(),
            bin_install_path.to_string_lossy()
        );
        let tmp_file = tmp_dir.join(&format!("__{}_backup", &archive_bin_name));
        Move::from_source(&new_exe)
            .replace_using_temp(&tmp_file)
            .to_dest(&bin_install_path)
            .map_err(|e| ErrorDetails::CLIInstallError { msg: e.to_string() })?;

        info!(
            "{} Succesfully updated to the latest Apollo CLI. Enjoy!",
            style::ROCKET
        );
        Ok(ExitCode::Success)
    }
}
