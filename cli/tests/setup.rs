#[cfg(unix)]
mod unix {
    use assert_cmd::prelude::*;
    use predicates::prelude::*;
    use std::env;
    use std::fs::{set_permissions, DirBuilder, File, OpenOptions};
    use std::io::{Read, Result, Write};
    use std::path::PathBuf;
    use std::process::Command;

    use tempfile::tempdir;

    #[test]
    fn not_found_in_usage() {
        let mut cli = Command::cargo_bin(env!("CARGO_PKG_NAME")).unwrap();

        cli.assert()
            .code(0)
            .stdout(predicate::str::contains("setup").not());
    }

    #[cfg(unix)]
    #[test]
    fn errors_with_no_home_environment() {
        let dir = tempdir().unwrap();

        let mut cli = Command::cargo_bin(env!("CARGO_PKG_NAME")).unwrap();

        cli.arg("setup")
            .arg("--verbose")
            .env("HOME", dir.path())
            .assert()
            .code(4)
            .stderr(predicate::str::contains(format!(
                "edit your profile manually to add '{}' to your PATH",
                dir.path().join(".apollo/bin").to_string_lossy().to_string()
            )));
    }

    #[cfg(unix)]
    #[test]
    fn successful_setup_not_fish() -> Result<()> {
        let dir = tempdir().unwrap();
        let has_apollo = predicate::str::contains("export PATH=\"$HOME/.apollo/bin:$PATH");
        let mut cli = Command::cargo_bin(env!("CARGO_PKG_NAME")).unwrap();

        let profile = create_profile(&dir.path().join(".profile"))?;
        let bash_profile = create_profile(&dir.path().join(".bash_profile"))?;
        let bashrc = create_profile(&dir.path().join(".bashrc"))?;
        let zshrc = create_profile(&dir.path().join(".zshrc"))?;

        cli.arg("setup")
            .arg("--verbose")
            .env("HOME", dir.path())
            .assert()
            .code(0)
            .stderr(predicate::str::contains("Setup complete"));

        let profile_buf = read_profile(profile)?;
        assert_eq!(true, has_apollo.eval(&profile_buf));

        let bash_profile_buf = read_profile(bash_profile)?;
        assert_eq!(true, has_apollo.eval(&bash_profile_buf));

        let bashrc_buf = read_profile(bashrc)?;
        assert_eq!(true, has_apollo.eval(&bashrc_buf));

        let zshrc_buf = read_profile(zshrc)?;
        assert_eq!(true, has_apollo.eval(&zshrc_buf));
        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn successful_setup_fish() -> Result<()> {
        let dir = tempdir().unwrap();
        let has_apollo = predicate::str::contains("set -gx PATH \"$HOME/.apollo/bin\" $PATH");
        let mut cli = Command::cargo_bin(env!("CARGO_PKG_NAME")).unwrap();

        let fish_path = dir.path().join(".config/fish");
        DirBuilder::new().recursive(true).create(&fish_path)?;

        let fish = create_profile(&fish_path.join("config.fish"))?;

        cli.arg("setup")
            .arg("--verbose")
            .env("HOME", dir.path())
            .assert()
            .code(0)
            .stderr(predicate::str::contains("Setup complete"));

        let fish_buf = read_profile(fish)?;
        assert_eq!(true, has_apollo.eval(&fish_buf));

        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn removes_existing_apollo_paths() -> Result<()> {
        let dir = tempdir().unwrap();
        let has_apollo = predicate::str::contains("export PATH=\"$HOME/.apollo/bin:$PATH");
        let mut cli = Command::cargo_bin(env!("CARGO_PKG_NAME")).unwrap();

        let mut profile = create_profile(&dir.path().join(".profile"))?;
        writeln!(profile, "# .apollo/bin")?;

        cli.arg("setup")
            .env("HOME", dir.path())
            .assert()
            .code(0)
            .stderr(predicate::str::contains("Setup complete"));

        let profile_buf = read_profile(profile)?;
        assert_eq!(false, has_apollo.eval(&profile_buf));
        assert_eq!(
            false,
            predicate::str::contains("# .apollo").eval(&profile_buf)
        );

        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn successful_setup_custom_profile() -> Result<()> {
        let dir = tempdir().unwrap();
        let has_apollo = predicate::str::contains("export PATH=\"$HOME/.apollo/bin:$PATH");
        let mut cli = Command::cargo_bin(env!("CARGO_PKG_NAME")).unwrap();

        let path = dir.path().join(".my_config_fmt");
        let profile = create_profile(&path)?;

        cli.arg("setup")
            .arg("--verbose")
            .env("HOME", dir.path())
            .env("PROFILE", &path.to_string_lossy().to_string())
            .assert()
            .code(0)
            .stderr(predicate::str::contains("Setup complete"));

        let profile_buf = read_profile(profile)?;
        assert_eq!(true, has_apollo.eval(&profile_buf));

        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn warns_if_cannot_write() -> Result<()> {
        let dir = tempdir().unwrap();
        let mut cli = Command::cargo_bin(env!("CARGO_PKG_NAME")).unwrap();

        let path = dir.path().join(".profile");
        let file = create_profile(&path)?;
        let metadata = file.metadata()?;
        let mut permissions = metadata.permissions();

        permissions.set_readonly(true);
        set_permissions(path, permissions)?;

        cli.arg("setup")
            .env("HOME", dir.path())
            .env("APOLLO_LOG_LEVEL", "warn")
            .assert()
            .code(4)
            .stderr(predicate::str::contains(
                "Found profile script, but could not modify it:",
            ));

        Ok(())
    }

    fn create_profile(path: &PathBuf) -> Result<File> {
        OpenOptions::new()
            .create(true)
            .write(true)
            .read(true)
            .open(path)
    }

    fn read_profile(mut file: File) -> Result<String> {
        let mut buf = String::new();
        file.read_to_string(&mut buf)?;
        Ok(buf)
    }
}

#[cfg(windows)]
mod windows {
    use std::env;
    use std::io;
    use std::process::Command;

    use assert_cmd::prelude::*;
    use predicates::prelude::*;
    use winreg::enums::*;
    use winreg::RegKey;

    #[test]
    fn not_found_in_usage() {
        let mut cli = Command::cargo_bin(env!("CARGO_PKG_NAME")).unwrap();

        cli.assert()
            .code(0)
            .stdout(predicate::str::contains("setup").not());
    }

    // Since these test share a common db (the winreg) that we can't easily mock
    // we combine the tests into a single one (so that they don't run in parallel)
    // instead of forcing the windows test suite to be run single threaded
    #[test]
    fn write_path_to_registry() -> io::Result<()> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (key, _disp) = hkcu.create_subkey("Environment")?;
        let current_path: String = key.get_value("Path")?;
        // delete the Path value in the Environment sub_key
        key.set_value("Path", &";")?;

        let mut cli = Command::cargo_bin(env!("CARGO_PKG_NAME")).unwrap();

        cli.arg("setup")
            .arg("--debug")
            .assert()
            .code(0)
            .stderr(predicate::str::contains("Setup complete"));

        key.set_value("Path", &current_path)?;

        // below is a *new* test (error_if_path_not_found())

        // delete the Path value in the Environment sub_key
        key.delete_value("Path")?;

        let mut cli_two = Command::cargo_bin(env!("CARGO_PKG_NAME")).unwrap();

        cli_two
            .arg("setup")
            .assert()
            .code(4)
            .stderr(predicate::str::contains(
                "Could not read user Path environment variable.",
            ));

        key.set_value("Path", &current_path)?;

        Ok(())
    }
}
