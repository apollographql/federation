use assert_cmd::prelude::*; // Add methods on commands
use predicates::prelude::*;
use std::process::Command; // Run programs // Used for writing assertions

#[test]
fn no_command_used() -> Result<(), Box<dyn std::error::Error>> {
    let mut apollo = Command::cargo_bin("apollo").unwrap();

    apollo
        .assert()
        .code(1)
        .stderr(predicate::str::contains("USAGE"));

    Ok(())
}

#[test]
fn prints_types() -> Result<(), Box<dyn std::error::Error>> {
    let mut apollo = Command::cargo_bin("apollo").unwrap();

    apollo
        .arg("print")
        // current_dir is `apollo`, not `apollo/tests`
        .arg("./tests/fixtures/basic.graphql")
        .arg("./tests/fixtures/my-enum.graphql")
        .assert()
        .success()
        .stdout(predicate::str::contains("type Query"))
        .stdout(predicate::str::contains("type User"))
        .stdout(predicate::str::contains("  favoriteSongs: [Song]"))
        .stdout(predicate::str::contains("enum MyEnum"));

    Ok(())
}
