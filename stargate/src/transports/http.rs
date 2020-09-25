use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct GraphQLRequest {
    pub query: String,
    #[serde(rename = "operationName")]
    pub operation_name: Option<String>,
    pub variables: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize)]
pub struct GraphQLResponse {
    pub data: Option<serde_json::Value>,
    // errors: 'a Option<async_graphql::http::GQLError>,
}

pub struct RequestContext {
    pub graphql_request: GraphQLRequest,
}
