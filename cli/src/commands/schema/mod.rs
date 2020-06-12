pub mod check;
pub mod get;
pub mod store;

use structopt::StructOpt;

use crate::errors::{ErrorDetails, Fallible};
pub use check::Check;
pub use get::Get;
use regex::Regex;
pub use store::Store;

enum SchemaRef {
    SchemaVariantRef { graph_id: String, variant: String },
    SchemaHashRef { graph_id: String, hash: String },
}

fn parse_schema_ref(src: &str) -> Fallible<SchemaRef> {
    let schema_variant_ref_regex =
        Regex::new("^([a-zA-Z][a-zA-Z0-9_-]{0,63})@([a-zA-Z0-9][/.a-zA-Z0-9_:-]{0,63})$").unwrap();
    let schema_hash_ref_regex =
        Regex::new("^([a-zA-Z][a-zA-Z0-9_-]{0,63})#([[:xdigit:]]{64})$").unwrap();
    let variant_capture = schema_variant_ref_regex.captures(src);
    if variant_capture.is_some() {
        let cap = variant_capture.unwrap();
        return Ok(SchemaRef::SchemaVariantRef {
            graph_id: cap[1].to_string(),
            variant: cap[2].to_string(),
        });
    }

    let hash_capture = schema_hash_ref_regex.captures(src);
    if hash_capture.is_some() {
        let cap = hash_capture.unwrap();
        return Ok(SchemaRef::SchemaHashRef {
            graph_id: cap[1].to_string(),
            hash: cap[2].to_string(),
        });
    }

    Err(ErrorDetails::InputError {
        msg: format!("Schemref {} is not a valid schemaref", src),
    }
    .into())
}

/// This represents the `GraphQLDocument` scalar in our gql schema and presents type mappings for rust.
pub type GraphQLDocument = String;

#[derive(StructOpt)]
#[structopt(rename_all = "kebab-case")]
pub enum Schema {
    ///  Get schema from a graph variant or schema hash
    Get(get::Get),
    Store(store::Store),
    Check(check::Check),
}
