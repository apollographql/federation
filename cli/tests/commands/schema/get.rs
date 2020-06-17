use crate::utils::{add_mock_graphql, get_cli};
use assert_cmd::prelude::*;
use predicates::prelude::*;
use rand::seq::SliceRandom;
use serde_json::Value;
use std::str;
use wiremock::matchers::method;
use wiremock::{Request, ResponseTemplate};

fn hash() -> String {
    let chars = vec![
        '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f',
    ];

    (0..64)
        .map(|_| chars.choose(&mut rand::thread_rng()).unwrap())
        .collect()
}

#[test]
fn schem_ref_error() {
    let mut cli = get_cli();
    cli.command
        .arg("schema")
        .arg("get")
        .arg("test")
        .assert()
        .code(6);
}

#[async_std::test]
async fn gets_schema_by_hash() {
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

    let h = hash();
    let h_clone = h.clone();

    let matcher = move |request: &Request| {
        let body: Value = serde_json::from_str(str::from_utf8(&request.body).unwrap()).unwrap();
        let variables = &body["variables"];
        assert_eq!(variables["graphId"], "test");
        assert!(variables["variant"].is_null());
        assert_eq!(variables["hash"], h);
        true
    };

    add_mock_graphql(&mut cli, response, matcher).await.unwrap();

    cli.command
        .arg("schema")
        .arg("get")
        .arg(format!("test#{}", h_clone))
        .assert()
        .code(0);
}

#[async_std::test]
async fn gets_schema() {
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

    let matcher = move |request: &Request| {
        let body: Value = serde_json::from_str(str::from_utf8(&request.body).unwrap()).unwrap();
        let variables = &body["variables"];
        assert_eq!(variables["graphId"], "test");
        assert_eq!(variables["variant"], "test");
        assert!(variables["hash"].is_null());
        true
    };

    add_mock_graphql(&mut cli, response, matcher).await.unwrap();

    cli.command
        .arg("schema")
        .arg("get")
        .arg("test@test")
        .assert()
        .code(0);
}

#[async_std::test]
async fn error_non_200() {
    let mut cli = get_cli();
    let response = ResponseTemplate::new(500);
    add_mock_graphql(&mut cli, response, method("POST"))
        .await
        .unwrap();

    cli.command
        .arg("schema")
        .arg("get")
        .arg("test@test")
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
    add_mock_graphql(&mut cli, response, method("POST"))
        .await
        .unwrap();

    cli.command
        .arg("schema")
        .arg("get")
        .arg("test@test")
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
    add_mock_graphql(&mut cli, response, method("POST"))
        .await
        .unwrap();

    cli.command
        .arg("schema")
        .arg("get")
        .arg("test@test")
        .assert()
        .code(predicate::eq(8));
}
