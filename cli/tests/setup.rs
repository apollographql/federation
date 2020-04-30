use assert_cmd::prelude::*;
use predicates::prelude::*;
use std::env;
use std::process::Command;

// use tempfile::tempdir;

#[test]
fn not_found_in_usage() {
    let mut cli = Command::cargo_bin(env!("CARGO_PKG_NAME")).unwrap();

    cli.assert()
        .code(0)
        .stdout(predicate::str::contains("setup").not());
}

// #[cfg(unix)]
// #[test]
// fn errors_with_no_home_environment() {
//     let dir = tempdir().unwrap();

//     let mut cli = Command::cargo_bin(env!("CARGO_PKG_NAME")).unwrap();

//     cli.arg("setup")
//         .arg("--verbose")
//         .env("HOME", dir.path())
//         .assert()
//         .code(6)
//         .stderr(predicate::str::contains("Could not locate user profile"));
// }
