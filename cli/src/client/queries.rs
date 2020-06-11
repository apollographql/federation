use crate::client::Client;
use graphql_client::*;
use std::error::Error;

#[derive(GraphQLQuery)]
#[graphql(
    query_path = "graphql/me_query.graphql",
    schema_path = ".schema/schema.graphql",
    response_derives = "PartialEq, Debug",
    deprecated = "warn"
)]
pub struct MeQuery;

pub fn me_query(client: &Client) -> Result<Option<me_query::MeQueryMe>, Box<dyn Error>> {
    let data: Option<me_query::ResponseData> = client.send::<MeQuery>(me_query::Variables {})?;

    Ok(data.and_then(|data| data.me))
}
