use crate::client::Client;
use crate::commands::schema::{parse_schema_ref, GraphQLDocument, SchemaRef};
use crate::commands::Command;
use crate::errors::{ErrorDetails, ExitCode, Fallible};
use crate::telemetry::Session;
use graphql_client::*;
use structopt::StructOpt;

#[derive(StructOpt)]
#[structopt(rename_all = "kebab-case")]
pub struct Get {
    /// schema reference to get
    schema_ref: String,
}

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
        session.log_command("schema get");

        let client = Client::from(
            session.require_api_key()?,
            session.config.api_url.as_ref().unwrap().clone(),
        )?;

        let schema_ref = parse_schema_ref(&self.schema_ref)?;

        let variables = match schema_ref {
            SchemaRef::SchemaVariantRef { graph_id, variant } => get_schema_query::Variables {
                graph_id,
                variant: Some(variant),
                hash: None,
            },
            SchemaRef::SchemaHashRef { graph_id, hash } => get_schema_query::Variables {
                graph_id,
                variant: None,
                hash: Some(hash),
            },
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
