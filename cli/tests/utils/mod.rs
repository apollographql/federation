use assert_cmd::prelude::*;
use tempfile::tempdir;

use std::process::Command; // Run programs // Used for writing assertions // Add methods on commands

pub fn block_telmetry(cmd: &mut Command) {
    cmd.env("APOLLO_UPDATE_CHECK_DISABLED", "1")
        .env("APOLLO_TELEMETRY_DISABLED", "1");
}

pub fn block_update_check(cmd: &mut Command) {
    cmd.env("APOLLO_UPDATE_CHECK_DISABLED", "1")
        .env("APOLLO_TELEMETRY_DISABLED", "1");
}

pub fn block_side_effects(cmd: &mut Command) {
    block_update_check(cmd);
    block_telmetry(cmd);
}

pub fn add_home(cmd: &mut Command) {
    let dir = tempdir().unwrap();
    cmd.env("HOME", dir.path());
}

pub fn get_cli() -> std::process::Command {
    let mut cli = Command::cargo_bin(env!("CARGO_PKG_NAME")).unwrap();

    block_side_effects(&mut cli);
    add_home(&mut cli);

    cli
}

pub fn get_bare_cli() -> std::process::Command {
    Command::cargo_bin(env!("CARGO_PKG_NAME")).unwrap()
}
