use crate::client::Client;
use graphql_client::*;
use std::error::Error;

// We have to declare types for scalars in the schema.
type GraphQLDocument = String;

#[derive(GraphQLQuery)]
#[graphql(
    query_path = "graphql/get_schema_query.graphql",
    schema_path = "graphql/agm.graphql",
    response_derives = "PartialEq, Debug",
    deprecated = "warn"
)]
pub struct GetSchemaQuery;

pub fn get_schema_query(
    client: &Client,
    variables: get_schema_query::Variables,
) -> Result<Option<String>, Box<dyn Error>> {
    let response_body: Response<get_schema_query::ResponseData> =
        client.send::<GetSchemaQuery>(variables)?;

    let hash: Option<String> = response_body.data.and_then(|data| {
        data.service
            .and_then(|service| service.schema.map(|schema| schema.hash))
    });

    Ok(hash)
}

#[derive(GraphQLQuery)]
#[graphql(
    query_path = "graphql/me_query.graphql",
    schema_path = "graphql/agm.graphql",
    response_derives = "PartialEq, Debug",
    deprecated = "warn"
)]
pub struct MeQuery;

pub fn me_query(client: &Client) -> Result<Option<me_query::MeQueryMe>, Box<dyn Error>> {
    let response_body: Response<me_query::ResponseData> =
        client.send::<MeQuery>(me_query::Variables {})?;

    Ok(response_body.data.and_then(|data| data.me))
}

mod tests {
    #[test]
    #[should_panic] // will not panic with a real API key with access to "my-service".
    #[ignore]
    fn get_schema_query() {
        use super::*;
        let client = Client::from("todo_get_api_key".to_owned());

        let vars = get_schema_query::Variables {
            service_id: "my-service".to_owned(),
            variant: "current".to_owned(),
        };
        let hash = get_schema_query(&client, vars).unwrap().unwrap();
        println!("{}", hash);
    }

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
