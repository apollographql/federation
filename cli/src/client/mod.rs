use crate::errors::{ApolloError, ErrorDetails, Fallible};
use graphql_client::{GraphQLQuery, Response};
use http::Uri;
use reqwest::blocking;
use std::env;

mod queries;

pub struct Client {
    api_key: String,
    uri: Uri,
    reqwest: blocking::Client,
}

impl Client {
    pub(crate) fn from(api_key: String, uri: String) -> Fallible<Client> {
        Ok(Client {
            api_key,
            uri: uri
                .parse::<Uri>()
                .map_err(|e| ErrorDetails::CliConfigReadError {
                    msg: format!("Invalid api url: {:?}", e),
                    path: "api_url".to_string(),
                })?,
            reqwest: blocking::Client::new(),
        })
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
                env::var("CARGO_PKG_VERSION").unwrap_or("dev".into()),
            )
            .header("x-api-key", &self.api_key)
            .json(&request_body)
            .send()
            .map_err(|e| {
                ApolloError::from(ErrorDetails::RegistryInvalidGraphQLError { msg: e.to_string() })
            })?;

        let response_body: Response<Q::ResponseData> = res.json().map_err(|e| {
            ApolloError::from(ErrorDetails::RegistryInvalidGraphQLError { msg: e.to_string() })
        })?;

        match response_body.errors {
            Some(err) => Err(ErrorDetails::GraphQLError {
                msg: err
                    .into_iter()
                    .map(|err| err.message)
                    .collect::<Vec<String>>()
                    .join("\n"),
            }
            .into()),
            None => Ok(response_body.data),
        }
    }
}
