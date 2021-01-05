use crate::Stargate;
use http::{HeaderMap, HeaderValue};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Serialize, Deserialize, Debug)]
pub struct GraphQLRequest {
    pub query: String,
    #[serde(rename = "operationName")]
    pub operation_name: Option<String>,
    pub variables: Option<Value>,
}

#[derive(Serialize, Deserialize)]
pub struct GraphQLResponse {
    pub data: Option<Value>,
    // errors: 'a Option<async_graphql::http::GQLError>,
}

pub struct RequestContext<'req> {
    pub graphql_request: GraphQLRequest,
    pub header_map: HeaderMap<&'req HeaderValue>,
}

#[derive(Debug)]
pub struct ServerState<'app> {
    pub stargate: Stargate<'app>,
}
