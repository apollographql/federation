use camino::Utf8PathBuf;
use serde::{Deserialize, Serialize};
use url::Url;

/// Config for a single [subgraph](https://www.apollographql.com/docs/federation/subgraphs/)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubgraphConfig {
    /// The routing URL for the subgraph.
    /// This will appear in supergraph SDL and
    /// instructs the graph router to send all requests
    /// for this subgraph to this URL.
    pub routing_url: Option<String>,

    /// The location of the subgraph's SDL
    pub schema: SchemaSource,
}

impl SubgraphConfig {
    /// Returns SDL from the configuration file if it exists.
    /// Returns None if the configuration does not include raw SDL.
    pub fn get_sdl(&self) -> Option<String> {
        if let SchemaSource::Sdl { sdl } = &self.schema {
            Some(sdl.to_owned())
        } else {
            None
        }
    }
}

/// Options for getting SDL:
/// the graph registry, a file, or an introspection URL.
///
/// NOTE: Introspection strips all comments and directives
/// from the SDL.
#[derive(Debug, Clone, Serialize, Deserialize)]
// this is untagged, meaning its fields will be flattened into the parent
// struct when de/serialized. There is no top level `schema_source`
// in the configuration.
#[serde(untagged)]
pub enum SchemaSource {
    File { file: Utf8PathBuf },
    SubgraphIntrospection { subgraph_url: Url },
    Subgraph { graphref: String, subgraph: String },
    Sdl { sdl: String },
}

/// The `SubgraphDefinition` represents everything we need to know about a
/// service (subgraph) for its GraphQL runtime responsibilities. It is not
/// at all different from the notion of [`ServiceDefinition` in TypeScript]
/// used in Apollo Gateway's operation.
///
/// This struct has nothing to do with the configuration file itself.
///
/// Since we'll be running this within a JavaScript environment these properties
/// will be serialized into camelCase, to match the JavaScript expectations.
///
/// [`ServiceDefinition` in TypeScript]: https://github.com/apollographql/federation/blob/d2e34909/federation-js/src/composition/types.ts#L49-L53
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubgraphDefinition {
    /// The name of the service (subgraph).  We use this name internally to
    /// in the representation of the composed schema and for designations
    /// within the human-readable QueryPlan.
    pub name: String,
    /// The routing/runtime URL where the subgraph can be found that will
    /// be able to fulfill the requests it is responsible for.
    pub url: String,
    /// The Schema Definition Language (SDL)
    pub sdl: String,
}

impl SubgraphDefinition {
    /// Create a new [`SubgraphDefinition`]
    pub fn new<N: Into<String>, U: Into<String>, S: Into<String>>(
        name: N,
        url: U,
        sdl: S,
    ) -> SubgraphDefinition {
        SubgraphDefinition {
            name: name.into(),
            url: url.into(),
            sdl: sdl.into(),
        }
    }
}
