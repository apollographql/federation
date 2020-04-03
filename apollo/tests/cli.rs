use assert_cmd::prelude::*; // Add methods on commands
use predicates::prelude::*;
use std::process::Command; // Run programs // Used for writing assertions

#[test]
fn file_doesnt_exist() -> Result<(), Box<dyn std::error::Error>> {
    let mut cmd = Command::cargo_bin("apollo")?;

    cmd.assert()
        .success()
        .stdout(predicate::str::contains("hello world"));

    Ok(())
}
