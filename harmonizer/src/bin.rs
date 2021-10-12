use harmonizer::harmonize;

use supergraph_config::SupergraphConfig;

use camino::Utf8PathBuf;
use structopt::StructOpt;

fn main() -> Result<(), anyhow::Error> {
    let app = Harmonizer::from_args();
    app.run()
}

#[derive(Debug, StructOpt)]
#[structopt(
    name = "harmonizer",
    about = "A utility for composing multiple subgraphs into a supergraph"
)]
struct Harmonizer {
    #[structopt(subcommand)]
    command: Command,
}

impl Harmonizer {
    fn run(&self) -> Result<(), anyhow::Error> {
        match &self.command {
            Command::Compose(command) => command.run(),
        }
    }
}

#[derive(Debug, StructOpt)]
enum Command {
    /// Compose a supergraph from a fully resolved supergraph config YAML
    Compose(Compose),
}

#[derive(Debug, StructOpt)]
struct Compose {
    /// The path to the fully resolved supergraph YAML.
    ///
    /// NOTE: Each subgraph entry MUST contain raw SDL
    /// as the schema source.
    config_file: Utf8PathBuf,
}

impl Compose {
    fn run(&self) -> Result<(), anyhow::Error> {
        let supergraph_config = SupergraphConfig::new_from_yaml_file(&self.config_file)?;
        let subgraph_definitions = supergraph_config.get_subgraph_definitions()?;
        harmonize(subgraph_definitions).map(|composition_result| {
            println!("{}", composition_result.supergraph_sdl);
        })?;
        Ok(())
    }
}
