use crate::{Error, Result, SubgraphConfig, SubgraphDefinition};

use camino::Utf8PathBuf;
use serde::{Deserialize, Serialize};

use std::{collections::BTreeMap, fs};

/// The configuration for a single supergraph
/// composed of multiple subgraphs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupergraphConfig {
    // Store config in a BTreeMap, as HashMap is non-deterministic.
    subgraphs: BTreeMap<String, SubgraphConfig>,
}

impl SupergraphConfig {
    /// Create a new SupergraphConfig from a YAML string in memory.
    pub fn new_from_yaml(yaml: &str) -> Result<SupergraphConfig> {
        let parsed_config =
            serde_yaml::from_str(yaml).map_err(|e| Error::InvalidConfiguration {
                message: e.to_string(),
            })?;

        log::debug!("{:?}", parsed_config);

        Ok(parsed_config)
    }

    /// Create a new SupergraphConfig from a YAML file.
    pub fn new_from_yaml_file<P: Into<Utf8PathBuf>>(config_path: P) -> Result<SupergraphConfig> {
        let config_path: Utf8PathBuf = config_path.into();
        let supergraph_yaml = fs::read_to_string(&config_path).map_err(|e| Error::MissingFile {
            file_path: config_path.to_string(),
            message: e.to_string(),
        })?;

        let parsed_config = SupergraphConfig::new_from_yaml(&supergraph_yaml)?;

        Ok(parsed_config)
    }

    /// Returns a Vec of resolved subgraphs, if and only if they are all resolved.
    /// Resolved in this sense means that each subgraph config includes
    /// a name, a URL, and raw SDL.
    pub fn get_subgraph_definitions(&self) -> Result<Vec<SubgraphDefinition>> {
        let mut subgraph_definitions = Vec::new();
        let mut unresolved_subgraphs = Vec::new();
        for (subgraph_name, subgraph_config) in &self.subgraphs {
            if let Some(sdl) = subgraph_config.get_sdl() {
                if let Some(routing_url) = &subgraph_config.routing_url {
                    subgraph_definitions.push(SubgraphDefinition::new(
                        subgraph_name,
                        routing_url,
                        sdl,
                    ));
                } else {
                    unresolved_subgraphs.push(subgraph_name);
                }
            } else {
                unresolved_subgraphs.push(subgraph_name);
            }
        }
        if !unresolved_subgraphs.is_empty() {
            Err(Error::SubgraphsNotResolved {
                subgraph_names: format!("{:?}", &unresolved_subgraphs),
            })
        } else if subgraph_definitions.is_empty() {
            Err(Error::NoSubgraphsFound)
        } else {
            Ok(subgraph_definitions)
        }
    }
}

impl From<Vec<SubgraphDefinition>> for SupergraphConfig {
    fn from(input: Vec<SubgraphDefinition>) -> Self {
        let mut subgraphs = BTreeMap::new();
        for subgraph_definition in input {
            subgraphs.insert(
                subgraph_definition.name,
                SubgraphConfig {
                    routing_url: Some(subgraph_definition.url),
                    schema: crate::SchemaSource::Sdl {
                        sdl: subgraph_definition.sdl,
                    },
                },
            );
        }
        Self { subgraphs }
    }
}

// implement IntoIterator so you can do:
// for (subgraph_name, subgraph_metadata) in supergraph_config.into_iter() { ... }
impl IntoIterator for SupergraphConfig {
    type Item = (String, SubgraphConfig);
    type IntoIter = std::collections::btree_map::IntoIter<String, SubgraphConfig>;

    fn into_iter(self) -> Self::IntoIter {
        self.subgraphs.into_iter()
    }
}

#[cfg(test)]
mod tests {
    use super::SupergraphConfig;

    use assert_fs::TempDir;
    use camino::Utf8PathBuf;
    use std::convert::TryFrom;
    use std::fs;

    #[test]
    fn it_can_parse_valid_config() {
        let raw_good_yaml = r#"subgraphs:
  films:
    routing_url: https://films.example.com
    schema:
      file: ./good-films.graphql
  people:
    routing_url: https://people.example.com
    schema:
      file: ./good-people.graphql
"#;

        assert!(SupergraphConfig::new_from_yaml(raw_good_yaml).is_ok());
    }

    #[test]
    fn it_can_parse_valid_config_from_fs() {
        let raw_good_yaml = r#"subgraphs:
  films:
    routing_url: https://films.example.com
    schema:
      file: ./good-films.graphql
  people:
    routing_url: https://people.example.com
    schema:
      file: ./good-people.graphql
"#;

        let tmp_home = TempDir::new().unwrap();
        let mut config_path = Utf8PathBuf::try_from(tmp_home.path().to_path_buf()).unwrap();
        config_path.push("config.yaml");
        fs::write(&config_path, raw_good_yaml).unwrap();

        assert!(SupergraphConfig::new_from_yaml_file(&config_path).is_ok());
    }

    #[test]
    fn it_can_parse_valid_config_with_introspection() {
        let raw_good_yaml = r#"subgraphs:
  films:
    routing_url: https://films.example.com
    schema:
      file: ./films.graphql
  people:
    schema:
      subgraph_url: https://people.example.com
  reviews:
    schema:
      graphref: mygraph@current
      subgraph: reviews
"#;

        assert!(SupergraphConfig::new_from_yaml(raw_good_yaml).is_ok());
    }

    #[test]
    fn it_errors_on_invalid_config() {
        let raw_bad_yaml = r#"subgraphs:
  films:
    routing_______url: https://films.example.com
    schemaaaa:
        file:: ./good-films.graphql
  people:
    routing____url: https://people.example.com
    schema_____file: ./good-people.graphql"#;

        assert!(SupergraphConfig::new_from_yaml(raw_bad_yaml).is_err())
    }
}
