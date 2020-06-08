use crate::client::Client;
use crate::commands::schema::GraphQLDocument;
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
        let client = Client::from(
            session.require_api_key()?,
            session.config.api_url.as_ref().unwrap().clone(),
        );
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

        match maybe_document {
            None => Err(ErrorDetails::NotFoundError {
                msg: "Schema not found".to_string(),
            }
            .into()),
            Some(document) => {
                println!("{}", document);
                Ok(ExitCode::Success)
            }
        }
    }
}
