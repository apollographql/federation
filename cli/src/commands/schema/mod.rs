pub mod check;
pub mod get;
pub mod store;

use structopt::StructOpt;

use crate::errors::{ErrorDetails, Fallible};
pub use check::Check;
pub use get::Get;
use regex::Regex;
pub use store::Store;

#[derive(PartialEq, Debug)]
enum SchemaRef {
    SchemaVariantRef { graph_id: String, variant: String },
    SchemaHashRef { graph_id: String, hash: String },
}

fn parse_schema_ref(src: &str) -> Fallible<SchemaRef> {
    let schema_variant_ref_regex =
        Regex::new("^([a-zA-Z][a-zA-Z0-9_-]{0,63})@([a-zA-Z0-9][/.a-zA-Z0-9_:-]{0,63})$").unwrap();

    if let Some(cap) = schema_variant_ref_regex.captures(src) {
        return Ok(SchemaRef::SchemaVariantRef {
            graph_id: cap[1].to_string(),
            variant: cap[2].to_string(),
        });
    }

    let schema_hash_ref_regex =
        Regex::new("^([a-zA-Z][a-zA-Z0-9_-]{0,63})#([[:xdigit:]]{64})$").unwrap();

    if let Some(cap) = schema_hash_ref_regex.captures(src) {
        return Ok(SchemaRef::SchemaHashRef {
            graph_id: cap[1].to_string(),
            hash: cap[2].to_string(),
        });
    }

    Err(ErrorDetails::InputError {
        msg: format!("{} is not a valid schema reference", src),
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

#[cfg(test)]
mod tests {
    use super::{parse_schema_ref, SchemaRef};
    use rand;
    use rand::seq::SliceRandom;

    fn hash() -> String {
        let chars = vec![
            '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f',
        ];

        (0..64)
            .map(|_| chars.choose(&mut rand::thread_rng()).unwrap())
            .collect()
    }

    #[test]
    fn parse_variant_ref() {
        let output = parse_schema_ref("graphID@variant");
        assert_eq!(
            output.unwrap(),
            SchemaRef::SchemaVariantRef {
                graph_id: "graphID".to_string(),
                variant: "variant".to_string()
            }
        );
    }

    #[test]
    fn parse_hash_ref() {
        let h = hash();
        let output = parse_schema_ref(format!("graphID#{}", h).as_str());
        assert_eq!(
            output.unwrap(),
            SchemaRef::SchemaHashRef {
                graph_id: "graphID".to_string(),
                hash: h
            }
        );
    }

    #[test]
    fn parse_fail() {
        let output = parse_schema_ref("bad schema ref");
        assert!(output.is_err());
    }
}
