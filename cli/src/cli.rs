use structopt::StructOpt;

use crate::commands::{self, Command};
use crate::errors::{ExitCode, Fallible};

#[derive(StructOpt)]
#[structopt(
    name = "Apollo CLI",
    about = "The [Experimental] Apollo CLI, for supporting all your graphql needs",
    rename_all = "kebab-case",
    raw(global_setting = "structopt::clap::AppSettings::ColoredHelp"),
    raw(global_setting = "structopt::clap::AppSettings::ColorAuto"),
    raw(global_setting = "structopt::clap::AppSettings::DeriveDisplayOrder"),
    raw(global_setting = "structopt::clap::AppSettings::DontCollapseArgsInUsage"),
    raw(global_setting = "structopt::clap::AppSettings::VersionlessSubcommands")
)]
/// The [Experimental] Apollo CLI, for supporting all your graphql needs :)
pub struct Apollo {
    #[structopt(subcommand)]
    pub command: Option<Subcommand>,

    #[structopt(long = "verbose", help = "Enables verbose diagnostics", global = true)]
    pub verbose: bool,

    #[structopt(
        long = "quiet",
        help = "Prevents unnecessary output",
        global = true,
        conflicts_with = "verbose",
        raw(aliases = r#"&["silent"]"#)
    )]
    pub quiet: bool,
}

impl Apollo {
    pub fn run(self) -> Fallible<ExitCode> {
        if let Some(command) = self.command {
            command.run()
        } else {
            Apollo::from_iter([std::env::args()[0], "help"].iter()).run()
        }
    }
}

#[derive(StructOpt)]
pub enum Subcommand {
    #[structopt(name = "login")]
    ///  🔓  log in to apollo
    Login(commands::Login),
    #[structopt(name = "setup", raw(setting = "structopt::clap::AppSettings::Hidden"))]
    ///  🚜  setup the Apollo toolchain in your environment
    Setup(commands::Setup),
}

impl Subcommand {
    pub fn run(self) -> Fallible<ExitCode> {
        match self {
            Subcommand::Login(login) => login.run(),
            Subcommand::Setup(setup) => setup.run(),
        }
    }
}
