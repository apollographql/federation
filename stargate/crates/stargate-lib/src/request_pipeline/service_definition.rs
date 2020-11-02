use crate::transports::http::{GraphQLRequest, GraphQLResponse, RequestContext};
use crate::Result;
use async_trait::async_trait;
use reqwest::Client;
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::iter::FromIterator;

#[derive(Debug)]
pub struct ServiceDefinition {
    pub url: String,
    pub client: Client,
}

#[async_trait]
pub trait Service {
    async fn send_operation<'req>(
        &self,
        request_context: &'req RequestContext<'req>,
        operation: String,
        variables: HashMap<String, Value>,
    ) -> Result<Value>;
}

#[async_trait]
impl Service for ServiceDefinition {
    async fn send_operation<'req>(
        &self,
        request_context: &'req RequestContext<'req>,
        operation: String,
        variables: HashMap<String, Value>,
    ) -> Result<Value> {
        let graphql_request = GraphQLRequest {
            query: operation,
            operation_name: None,
            variables: Some(Map::from_iter(variables.into_iter()).into()),
        };

        let mut request = self
            .client
            .post(&self.url)
            .header("userId", "1")
            .json(&graphql_request);

        for (header_name, header_value) in request_context.header_map.iter() {
            request = request.header(header_name, *header_value);
        }

        let response = request.send().await?;
        let GraphQLResponse { data } = response.json().await?;

        data.ok_or_else(|| unimplemented!("Handle error cases in send_operation"))
    }
}

#[cfg(test)]
mod tests {
    use super::ServiceDefinition;
    use crate::request_pipeline::service_definition::Service;
    use crate::transports::http::{GraphQLRequest, GraphQLResponse, RequestContext};
    use http::{HeaderMap, HeaderValue};
    use reqwest::Client;
    use serde_json::json;
    use std::collections::HashMap;
    use wiremock::matchers::{header, method};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    async fn get_mock_server(header_map: &HeaderMap<&HeaderValue>) -> MockServer {
        // Start a background HTTP server on a random local port
        let mock_server = MockServer::start().await;

        let response = ResponseTemplate::new(200).set_body_json(GraphQLResponse {
            data: Some(json!({"me": {"id": 1}})),
        });

        let mut mock_builder = Mock::given(method("POST"));
        for (header_name, header_value) in header_map.iter() {
            if let Ok(header_value) = header_value.to_str() {
                mock_builder = mock_builder.and(header(header_name.as_str(), header_value));
            }
        }

        mock_builder
            .respond_with(response)
            .expect(1)
            .mount(&mock_server)
            .await;

        mock_server
    }

    fn get_request_context<'a>(
        query: &str,
        header_map: HeaderMap<&'a HeaderValue>,
    ) -> RequestContext<'a> {
        let graphql_request = GraphQLRequest {
            operation_name: None,
            query: String::from(query),
            variables: None,
        };

        RequestContext {
            header_map,
            graphql_request,
        }
    }

    #[tokio::test]
    async fn basic_header_threading() {
        let header_name = "name";
        let header_value: HeaderValue =
            HeaderValue::from_str("value").expect("unhandled invalid header values");

        let mut header_map = HeaderMap::with_capacity(0);
        header_map.append(header_name, &header_value);

        let mock_server = get_mock_server(&header_map).await;
        let query = "{ __typename }";
        let request_context = get_request_context(query, header_map);
        let service = ServiceDefinition {
            url: String::from(&mock_server.uri()),
            client: Client::new(),
        };

        let result = service
            .send_operation(&request_context, String::from(query), HashMap::new())
            .await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn multi_header_threading() {
        let header_name = "name";
        let header_values = vec![
            HeaderValue::from_str("value1").unwrap(),
            HeaderValue::from_str("value2").unwrap(),
        ];

        let mut header_map = HeaderMap::with_capacity(0);
        header_map.append(header_name, &header_values[0]);
        header_map.append(header_name, &header_values[1]);

        let mock_server = get_mock_server(&header_map).await;
        let query = "{ __typename }";
        let request_context = get_request_context(query, header_map);
        let service = ServiceDefinition {
            url: String::from(&mock_server.uri()),
            client: Client::new(),
        };

        let result = service
            .send_operation(&request_context, String::from(query), HashMap::new())
            .await;

        assert!(result.is_ok());
    }
}
