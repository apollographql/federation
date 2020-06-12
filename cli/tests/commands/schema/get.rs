use crate::utils::{add_mock_graphql, get_cli};
use assert_cmd::prelude::*;
use predicates::prelude::*;
use serde_json::{json, Value};
use wiremock::matchers::method;
use wiremock::{Request, ResponseTemplate};
use std::str;
use std::str::from_utf8;
use json::object::Object;

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

    let matcher = move |request: &Request| {
        let body: Value= serde_json::from_str(str::from_utf8(&request.body).unwrap())
            .unwrap();
        let variables= body.get("variables").unwrap();
        assert!(variables.get("graphId").unwrap() == "test");
        assert!(variables.get("variant").unwrap().is_null());
        assert!(variables.get("hash").unwrap() == "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
        true
    };

    add_mock_graphql(&mut cli, response, matcher).await.unwrap();

    cli.command
        .arg("schema")
        .arg("get")
        .arg("test#aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
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
        let body: Value= serde_json::from_str(str::from_utf8(&request.body).unwrap())
            .unwrap();
        let variables= body.get("variables").unwrap();
        assert!(variables.get("graphId").unwrap() == "test");
        assert!(variables.get("variant").unwrap() == "test");
        assert!(variables.get("hash").unwrap().is_null());
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
