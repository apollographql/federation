mod utils;

#[cfg(unix)]
mod unix {
    // use std::env::consts::OS;
    // use std::error::Error;

    use assert_cmd::prelude::*;
    use predicates::prelude::*;
    // use tempfile::tempdir;
    // use wiremock::matchers::{method, PathExactMatcher};
    // use wiremock::{Mock, MockServer, ResponseTemplate};

    use crate::utils;

    #[test]
    fn no_command_used() -> Result<(), Box<dyn std::error::Error>> {
        let mut cli = utils::get_cli();

        cli.assert()
            .code(0)
            .stdout(predicate::str::contains("USAGE"));

        Ok(())
    }

    // async fn create_mock_proxy(
    //     response: ResponseTemplate,
    // ) -> Result<MockServer, Box<dyn Error + 'static>> {
    //     let proxy = MockServer::start().await;
    //     let platform: Option<&str> = match OS {
    //         "linux" | "macos" | "windows" => Some(OS),
    //         _ => None,
    //     };

    //     Mock::given(method("HEAD"))
    //         .and(PathExactMatcher::new(format!("cli/{}", platform.unwrap())))
    //         .respond_with(response)
    //         .expect(1..)
    //         .mount(&proxy)
    //         .await;

    //     Ok(proxy)
    // }

    // this test only verifies that the request is sent to the CDN as the printing
    // is flaky given its background thread status
    // #[async_std::test]
    // async fn prints_if_update_is_found() -> Result<(), Box<dyn std::error::Error>> {
    //     // this test will start failing if when this package passes version 100.0.0
    //     // if that ever happens, please send a nice bottle of gin to James Baxley
    //     let response = ResponseTemplate::new(200)
    //         .append_header("content-disposition", "filename=ap-v100.0.0-linux");
    //     let proxy = create_mock_proxy(response).await.unwrap();

    //     let dir = tempdir().unwrap();
    //     let mut cli = utils::get_bare_cli();

    //     cli.arg("setup")
    //         .env("HOME", dir.path())
    //         .env("APOLLO_CDN_URL", &proxy.uri())
    //         .env("SHELL", "/usr/bin/zsh")
    //         .assert()
    //         .code(4);

    //     Ok(())
    // }

    // #[async_std::test]
    // async fn checks_for_updates_in_background() -> Result<(), Box<dyn std::error::Error>> {
    //     let response =
    //         ResponseTemplate::new(200).append_header("content-disposition", "filename=ap-v0.1-linux");

    //     let proxy = create_mock_proxy(response).await.unwrap();
    //     let dir = tempdir().unwrap();
    //     let mut cli = utils::get_bare_cli();

    //     cli.arg("setup")
    //         .env("HOME", dir.path())
    //         .env("APOLLO_CDN_URL", &proxy.uri())
    //         .env("SHELL", "/usr/bin/zsh")
    //         .assert()
    //         .code(4)
    //         .stderr(predicate::str::contains("Could not locate user profile"));

    //     Ok(())
    // }
}
