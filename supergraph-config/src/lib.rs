mod error;
mod subgraph;
mod supergraph;

pub use error::Error;
pub type Result<T> = std::result::Result<T, Error>;
pub use subgraph::{SchemaSource, SubgraphConfig, SubgraphDefinition};
pub use supergraph::SupergraphConfig;
