use assert_cmd::prelude::*; // Add methods on commands
use predicates::prelude::*;
use std::process::Command; // Run programs // Used for writing assertions

#[test]
fn no_command_used() -> Result<(), Box<dyn std::error::Error>> {
    let mut cli = Command::cargo_bin(env!("CARGO_PKG_NAME")).unwrap();

    cli.assert()
        .code(0)
        .stdout(predicate::str::contains("USAGE"));

    Ok(())
}

// XXX test global flags and global variables here
