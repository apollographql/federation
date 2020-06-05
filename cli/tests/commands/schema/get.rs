#[cfg(unix)]
mod unix {
    use crate::utils::{add_mock_graphql, get_cli};
    use assert_cmd::prelude::*;
    use wiremock::ResponseTemplate;

    #[async_std::test]
    async fn gets_acephi_schema() {
        let mut cli = get_cli();
        let test_command = add_mock_graphql(&mut cli, ResponseTemplate::new(200))
            .await
            .unwrap();

        test_command.command.arg("schema").arg("get").assert();
    }
}
