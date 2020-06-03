use std::process::Command;

use assert_cmd::prelude::*;
use tempfile::{tempdir, TempDir};

// Run programs // Used for writing assertions // Add methods on commands

pub struct TestCommand {
    pub command: Command,
    pub home_dir: TempDir,
}

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

pub fn add_home(cmd: &mut Command) -> TempDir {
    let dir = tempdir().unwrap();
    cmd.env("HOME", dir.path());
    dir
}

pub fn get_cli() -> TestCommand {
    let mut cli = Command::cargo_bin(env!("CARGO_PKG_NAME")).unwrap();

    block_side_effects(&mut cli);
    let home_dir = add_home(&mut cli);

    TestCommand {
        command: cli,
        home_dir,
    }
}

pub fn get_bare_cli() -> std::process::Command {
    Command::cargo_bin(env!("CARGO_PKG_NAME")).unwrap()
}
