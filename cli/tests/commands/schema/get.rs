#[cfg(unix)]
mod unix {
    use crate::utils::{add_mock_graphql, get_cli};
    use assert_cmd::prelude::*;
    use wiremock::ResponseTemplate;

    #[async_std::test]
    async fn gets_acephi_schema() {
        let mut cli = get_cli();
        let response = ResponseTemplate::new(200).set_body_bytes(
            r#"{
                "data": {
                    "service": {
                        "schema": {
                            "document": "__test__"
                        }
                    }
                }
            }"#,
        );
        add_mock_graphql(&mut cli, response).await.unwrap();

        cli.command.arg("schema").arg("get").assert().code(0);
    }
}
