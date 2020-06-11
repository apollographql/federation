#[cfg(unix)]
mod unix {
    use crate::utils::{add_mock_graphql, get_cli};
    use assert_cmd::prelude::*;
    use predicates::prelude::*;
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

    #[async_std::test]
    async fn error_non_200() {
        let mut cli = get_cli();
        let response = ResponseTemplate::new(500);
        add_mock_graphql(&mut cli, response).await.unwrap();

        cli.command
            .arg("schema")
            .arg("get")
            .assert()
            .code(predicate::ne(0));
    }

    #[async_std::test]
    async fn error_graphql_errors() {
        let mut cli = get_cli();
        let response = ResponseTemplate::new(200).set_body_bytes(
            r#"{
                "errors": [
                    {
                        "__test__": 0
                    }
                ]
            }"#,
        );
        add_mock_graphql(&mut cli, response).await.unwrap();

        cli.command
            .arg("schema")
            .arg("get")
            .assert()
            .code(predicate::eq(3));
    }

    #[async_std::test]
    async fn error_schema_not_found() {
        let mut cli = get_cli();
        let response = ResponseTemplate::new(200).set_body_bytes(
            r#"{
                "data": {
                    "service": {}
                }
            }"#,
        );
        add_mock_graphql(&mut cli, response).await.unwrap();

        cli.command
            .arg("schema")
            .arg("get")
            .assert()
            .code(predicate::eq(8));
    }
}
