use crate::Stargate;
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

#[derive(Clone)] // XXX: Clone is required by tide, see if we can remove when removing tide.
pub struct ServerState<'app> {
    pub stargate: Stargate<'app>,
}
