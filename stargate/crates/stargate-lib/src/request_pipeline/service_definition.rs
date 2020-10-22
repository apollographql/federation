use std::collections::HashMap;
use std::iter::FromIterator;

use async_trait::async_trait;
use serde_json::{Map, Value};

use crate::transports::http::{GraphQLRequest, GraphQLResponse, RequestContext};
use crate::Result;

#[derive(Debug)]
pub struct ServiceDefinition {
    pub url: String,
}

#[async_trait]
pub trait Service {
    async fn send_operation<'request>(
        &self,
        request_context: &'request RequestContext<'request>,
        operation: String,
        variables: HashMap<String, Value>,
    ) -> Result<Value>;
}

#[async_trait]
impl Service for ServiceDefinition {
    async fn send_operation<'request>(
        &self,
        request_context: &'request RequestContext<'request>,
        operation: String,
        variables: HashMap<String, Value>,
    ) -> Result<Value> {
        let request = GraphQLRequest {
            query: operation,
            operation_name: None,
            variables: Some(Map::from_iter(variables.into_iter()).into()),
        };

        let headers = &request_context.header_map;

        let mut request_builder = surf::post(&self.url).header("userId", "1");
        for (&name, &value) in headers.into_iter() {
            request_builder = request_builder.header(name, value);
        }

        // TODO(ran) FIXME: use a single client, reuse connections.
        let GraphQLResponse { data } = request_builder
            .body(surf::Body::from_json(&request)?)
            .recv_json()
            .await?;

        data.ok_or_else(|| unimplemented!("Handle error cases in send_operation"))
    }
}

#[cfg(test)]
mod tests {
    use super::ServiceDefinition;
    use crate::request_pipeline::service_definition::Service;
    use crate::transports::http::{GraphQLRequest, GraphQLResponse, RequestContext};
    use serde_json::json;
    use std::collections::HashMap;
    use wiremock::matchers::{header, method};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    async fn get_mock_server(header_map: HashMap<&str, &str>) -> MockServer {
        // Start a background HTTP server on a random local port
        let mock_server = MockServer::start().await;

        let response = ResponseTemplate::new(200).set_body_json(GraphQLResponse {
            data: Some(json!({"me": {"id": 1}})),
        });

        let mut mock_builder = Mock::given(method("POST"));
        for (key, value) in header_map.into_iter() {
            mock_builder = mock_builder.and(header(key, value));
        }

        mock_builder
            .respond_with(response)
            .expect(1)
            .mount(&mock_server)
            .await;

        mock_server
    }

    fn get_request_context<'request>(
        query: &'request str,
        header_map: HashMap<&'static str, &'static str>,
    ) -> RequestContext<'request> {
        let graphql_request = GraphQLRequest {
            operation_name: None,
            query: String::from(query),
            variables: None,
        };

        RequestContext {
            header_map: header_map.clone(),
            graphql_request,
        }
    }

    #[async_std::test]
    async fn basic_header_threading() {
        let header_name = "name";
        let header_value = "value";

        let mut header_map: HashMap<&str, &str> = HashMap::new();
        header_map.insert(header_name, header_value);

        let mock_server = get_mock_server(header_map.clone()).await;

        let query = "{ __typename }";
        let request_context = get_request_context(query, header_map.clone());

        let service = ServiceDefinition {
            url: String::from(&mock_server.uri()),
        };

        let result = service
            .send_operation(&request_context, String::from(query), HashMap::new())
            .await;

        assert!(result.is_ok());
    }
}
