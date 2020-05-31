use graphql_client::{GraphQLQuery, Response};
use http::Uri;
use reqwest::blocking;
use std::error::Error;

mod queries;

static PROD_GQL_API_URL: &str = "https://engine-graphql.apollographql.com/api/graphql";

pub struct Client {
    api_key: String,
    uri: Uri,
    reqwest: blocking::Client,
}

impl Client {
    fn from(api_key: String) -> Client {
        Client {
            api_key,
            uri: PROD_GQL_API_URL.parse::<Uri>().unwrap(),
            reqwest: blocking::Client::new(),
        }
    }

    fn send<Q: GraphQLQuery>(
        &self,
        variables: Q::Variables,
    ) -> Result<Response<Q::ResponseData>, Box<dyn Error>> {
        let request_body = Q::build_query(variables);

        let res = self
            .reqwest
            .post(&self.uri.to_string())
            .header("Content-Type", "application/json")
            .header("apollographql-client-name", "internal-apollo-cli")
            .header("apollographql-client-version", "0.1")
            .header("x-api-key", &self.api_key)
            .json(&request_body)
            .send()?;

        let response_body: Response<Q::ResponseData> = res.json()?;
        Ok(response_body)
    }
}
