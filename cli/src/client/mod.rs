use crate::errors::{ApolloError, ErrorDetails, Fallible};
use graphql_client::{GraphQLQuery, Response};
use http::Uri;
use reqwest::blocking;
use std::env;

mod queries;

static PROD_GQL_API_URL: &str = "https://engine-graphql.apollographql.com/api/graphql";

fn api_uri() -> Uri {
    env::var("APOLLO_API_URL")
        .ok()
        .and_then(|url| url.parse::<Uri>().ok())
        .unwrap_or_else(|| PROD_GQL_API_URL.parse::<Uri>().unwrap())
}

pub struct Client {
    api_key: String,
    uri: Uri,
    reqwest: blocking::Client,
}

pub type GraphQLDocument = String;

impl Client {
    pub(crate) fn from(api_key: String) -> Client {
        Client {
            api_key,
            uri: api_uri(),
            reqwest: blocking::Client::new(),
        }
    }

    pub(crate) fn send<Q: GraphQLQuery>(
        &self,
        variables: Q::Variables,
    ) -> Fallible<Option<Q::ResponseData>> {
        let request_body = Q::build_query(variables);

        let res = self
            .reqwest
            .post(&self.uri.to_string())
            .header("Content-Type", "application/json")
            .header("apollographql-client-name", "experimental-apollo-cli")
            .header(
                "apollographql-client-version",
                env::var("CARGO_PKG_VERSION").unwrap_or("testing".into()),
            )
            .header("x-api-key", &self.api_key)
            .json(&request_body)
            .send()
            .map_err(|e| {
                ApolloError::from(ErrorDetails::RegistryNetworkError {
                    msg: e.to_string(),
                })
            })?;

        let response_body: Response<Q::ResponseData> = res.json()
            .map_err(|e| {
                ApolloError::from(ErrorDetails::RegistryNetworkError {
                    msg: e.to_string(),
                })
            })?;

        match response_body.errors {
            Some(err) => Err(ErrorDetails::GraphQLError {
                msg: err
                    .into_iter()
                    .map(|err| err.message.clone())
                    .collect::<Vec<String>>()
                    .join("\n"),
            }
            .into()),
            None => Ok(response_body.data),
        }
    }
}
