#[cfg(unix)]
mod unix {
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
    fn writes_auth_token_trims_whitespace() {
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
            .write_all(format!("    {}  ", test_api_key).as_ref())
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
    fn non_zero_exit_code_when_empty_string_key_entered() {
        let test_command = get_cli();
        let mut cli = test_command.command;
        {
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
                .write_all("".as_ref())
                .unwrap();
            assert_ne!(cli_spawn.wait().unwrap().success(), true);
        }

        {
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
                .write_all("         ".as_ref())
                .unwrap();
            assert_ne!(cli_spawn.wait().unwrap().success(), true);
        }
    }

    #[test]
    fn verify_environment_variables_for_config() {
        {
            let mut test_command = get_cli();
            let cli = test_command.command.arg("auth").arg("setup");
            let mut cli_spawn = cli
                .stdin(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .unwrap();
            cli_spawn
                .stdin
                .as_mut()
                .unwrap()
                .write_all("to be ignored".as_ref())
                .unwrap();
            let stderr = cli_spawn.wait_with_output().unwrap().stderr;
            let output = std::str::from_utf8(&stderr).unwrap();

            // We assert we have not seen a warning since there is _no_ key set
            assert_ne!(output.contains("WARN"), true);
        }
        {
            let mut test_command = get_cli();
            let cli = test_command
                .command
                .arg("auth")
                .arg("setup")
                .env("APOLLO__API_KEY", "I EXIST");

            let mut cli_spawn = cli
                .stdin(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .unwrap();

            cli_spawn
                .stdin
                .as_mut()
                .unwrap()
                .write_all("to be ignored".as_ref())
                .unwrap();

            let stderr = cli_spawn.wait_with_output().unwrap().stderr;
            let output = std::str::from_utf8(&stderr).unwrap();

            // We assert we have seen a warning since there is key set via env var
            assert_eq!(output.contains("WARN"), true);
        }
    }
}
