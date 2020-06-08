pub mod check;
pub mod get;
pub mod store;

use structopt::StructOpt;

pub use check::Check;
pub use get::Get;
pub use store::Store;

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
