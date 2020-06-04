use crate::client::{Client, GraphQLDocument};
use crate::commands::Command;
use crate::errors::{ErrorDetails, ExitCode, Fallible};
use crate::telemetry::Session;
use graphql_client::*;
use structopt::StructOpt;

#[derive(StructOpt)]
#[structopt(rename_all = "kebab-case")]
pub struct Get {}

#[derive(GraphQLQuery)]
#[graphql(
    query_path = "graphql/get_schema_query.graphql",
    schema_path = ".schema/schema.graphql",
    response_derives = "PartialEq, Debug",
    deprecated = "warn"
)]
struct GetSchemaQuery;

impl Command for Get {
    fn run(&self, session: &mut Session) -> Fallible<ExitCode> {
        session.require_api_key()?;

        let client = Client::from((session.config.api_key.as_ref().unwrap()).to_string());

        let variables = get_schema_query::Variables {
            graph_id: "acephei".into(),
            variant: Some("production".into()),
        };

        let data: Option<get_schema_query::ResponseData> =
            client.send::<GetSchemaQuery>(variables)?;

        let maybe_document: Option<String> = data.and_then(|data| {
            data.service
                .and_then(|service| service.schema.map(|schema| schema.document))
        });

        if maybe_document.is_none() {
            return Err(ErrorDetails::NotFoundError {
                msg: "Schema not found".to_string(),
            }
            .into());
        }

        let document = maybe_document.unwrap();

        println!("{}", document);

        Ok(ExitCode::Success)
    }
}
