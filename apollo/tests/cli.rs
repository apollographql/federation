use assert_cmd::prelude::*; // Add methods on commands
use predicates::prelude::*;
use std::process::Command; // Run programs // Used for writing assertions

#[test]
fn file_doesnt_exist() -> Result<(), Box<dyn std::error::Error>> {
    let mut apollo = Command::cargo_bin("apollo").unwrap();

    apollo
        .assert()
        .success()
        .stdout(predicate::str::contains("USAGE"));

    Ok(())
}

#[test]
fn print_doesnt() -> Result<(), Box<dyn std::error::Error>> {
    let mut apollo = Command::cargo_bin("apollo").unwrap();

    apollo
        .arg("print")
        .arg("../samples/basic.gql")
        .assert()
        .success()
        .stdout(predicate::str::contains("type Query"))
        .stdout(predicate::str::contains("type User"))
        .stdout(predicate::str::contains("type Song"));

    Ok(())
}
