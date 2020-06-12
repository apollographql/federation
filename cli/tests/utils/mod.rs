use std::process::Command;

use assert_cmd::prelude::*;
use std::error::Error;
use tempfile::{tempdir, TempDir};
use wiremock::{Match, Mock, MockServer, ResponseTemplate};

// Run programs // Used for writing assertions // Add methods on commands

pub struct TestCommand {
    pub command: Command,
    pub home_dir: TempDir,
    pub server: Option<MockServer>,
}

fn block_telmetry(cmd: &mut Command) {
    cmd.env("APOLLO_UPDATE_CHECK_DISABLED", "1")
        .env("APOLLO_TELEMETRY_DISABLED", "1");
}

fn block_update_check(cmd: &mut Command) {
    cmd.env("APOLLO_UPDATE_CHECK_DISABLED", "1")
        .env("APOLLO_TELEMETRY_DISABLED", "1");
}

fn block_side_effects(cmd: &mut Command) {
    block_update_check(cmd);
    block_telmetry(cmd);
}

fn add_home(cmd: &mut Command) -> TempDir {
    let dir = tempdir().unwrap();
    cmd.env("HOME", dir.path());
    dir
}

pub async fn add_mock_graphql<M: 'static + Match>(
    cli: &mut TestCommand,
    response: ResponseTemplate,
    matcher: M,
) -> Result<&mut TestCommand, Box<dyn Error + 'static>> {
    let proxy = MockServer::start().await;

    Mock::given(matcher)
        .respond_with(response)
        .expect(1..)
        .mount(&proxy)
        .await;

    cli.command
        .env("APOLLO__API_URL", proxy.uri())
        .env("APOLLO__API_KEY", "__test__");

    cli.server = Some(proxy);

    Ok(cli)
}

pub fn get_cli() -> TestCommand {
    let mut cli = Command::cargo_bin(env!("CARGO_PKG_NAME")).unwrap();

    block_side_effects(&mut cli);
    let home_dir = add_home(&mut cli);

    TestCommand {
        command: cli,
        home_dir,
        server: None,
    }
}
