use crate::utils::get_cli;
use config::Config;
use std::io::Write;
use std::process::Stdio;

#[test]
fn writes_auth_token() {
    let test_command = get_cli();
    let mut cli = test_command.command;

    let test_api_key = "test_key";

    let mut cli_spawn = cli
        .arg("auth")
        .arg("setup")
        .stdin(Stdio::piped())
        .spawn()
        .unwrap();

    cli_spawn
        .stdin
        .as_mut()
        .unwrap()
        .write_all(test_api_key.as_ref())
        .unwrap();
    cli_spawn.wait().unwrap();

    let config_path = test_command
        .home_dir
        .path()
        .join(".apollo")
        .join("config.toml");
    let mut s = Config::new();
    s.merge(config::File::with_name(config_path.to_str().unwrap()))
        .unwrap();
    assert_eq!(test_api_key, s.get::<String>("api_key").unwrap());
}

#[test]
fn verify_overwrite_auth_token() {
    let mut test_command = get_cli();
    let cli = test_command.command.arg("auth").arg("setup");
    let test_api_key = "test_key";

    {
        let mut cli_spawn = cli.stdin(Stdio::piped()).spawn().unwrap();

        cli_spawn
            .stdin
            .as_mut()
            .unwrap()
            .write_all("foo-bar".as_ref())
            .unwrap();
        cli_spawn.wait().unwrap();
    }

    {
        let mut cli_spawn = cli.stdin(Stdio::piped()).spawn().unwrap();

        cli_spawn
            .stdin
            .as_mut()
            .unwrap()
            .write_all("test_key".as_ref())
            .unwrap();
        cli_spawn.wait().unwrap();
    }

    let config_path = test_command
        .home_dir
        .path()
        .join(".apollo")
        .join("config.toml");
    let mut s = Config::new();
    s.merge(config::File::with_name(config_path.to_str().unwrap()))
        .unwrap();
    assert_eq!(test_api_key, s.get::<String>("api_key").unwrap());
}

#[test]
fn verify_environment_variables_for_config() {
    let mut test_command = get_cli();
    let cli = test_command
        .command
        .arg("auth")
        .arg("setup")
        .env("APOLLO__API_KEY", "I EXIST");
    let test_api_key = "test_key";

    {
        let mut cli_spawn = cli.stdin(Stdio::piped()).spawn().unwrap();

        cli_spawn
            .stdin
            .as_mut()
            .unwrap()
            .write_all("n".as_ref())
            .unwrap();
        cli_spawn.wait().unwrap();
    }

    let config_path = test_command
        .home_dir
        .path()
        .join(".apollo")
        .join("config.toml");
    let mut s = Config::new();
    s.merge(config::File::with_name(config_path.to_str().unwrap()))
        .unwrap();
    assert!(s.get::<String>("api_key").is_err());
}
