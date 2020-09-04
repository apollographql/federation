use async_trait::async_trait;

use std::collections::HashMap;

use crate::request_pipeline::executor::ExecutionContext;
use crate::transports::http::{GraphQLRequest, GraphQLResponse};
#[derive(Clone)]
pub struct ServiceDefinition {
    pub url: String,
}

#[async_trait]
pub trait Service {
    async fn send_operation<'schema, 'request>(
        &self,
        context: &ExecutionContext<'schema, 'request>,
        operation: String,
        variables: &HashMap<String, serde_json::Value>,
    ) -> std::result::Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync + 'static>>;
}

#[async_trait]
impl Service for ServiceDefinition {
    async fn send_operation<'schema, 'request>(
        &self,
        _context: &ExecutionContext<'schema, 'request>,
        operation: String,
        variables: &HashMap<String, serde_json::Value>,
    ) -> std::result::Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync + 'static>>
    {
        let request = GraphQLRequest {
            query: operation,
            operation_name: None,
            variables: Some(serde_json::to_value(&variables).unwrap()),
        };

        let mut res = surf::post(&self.url)
            .set_header("userId", "1")
            .body_json(&request)?
            .await?;
        let GraphQLResponse { data } = res.body_json().await?;
        if data.is_some() {
            Ok(data.unwrap())
        } else {
            unimplemented!("Handle error cases in send_operation")
        }
    }
}
