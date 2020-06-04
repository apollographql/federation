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

#[cfg(test)]
mod tests {
    #[test]
    #[should_panic] // will not panic with a real API key.
    #[ignore]
    fn me_query() {
        use super::*;
        let client = Client::from("todo_get_api_key".to_owned());
        let me = me_query(&client).unwrap().unwrap();
        println!("{:?}", me);
    }
}
