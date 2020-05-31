use structopt::clap::AppSettings;
use structopt::StructOpt;

use crate::commands::{self, Command};
use crate::errors::{ExitCode, Fallible};
use crate::telemetry::Session;
use crate::version::command_name;

#[derive(StructOpt)]
#[structopt(
    name = "Apollo CLI",
    about = "The [Experimental] Apollo CLI, for supporting all your graphql needs",
    rename_all = "kebab-case",
    global_setting = AppSettings::ColoredHelp,
    global_setting = AppSettings::ColorAuto,
    global_setting = AppSettings::DeriveDisplayOrder,
    global_setting = AppSettings::DontCollapseArgsInUsage,
    global_setting = AppSettings::VersionlessSubcommands,
)]
/// The _Experimental_ Apollo CLI, for supporting all your graphql needs :)
pub struct Apollo {
    #[structopt(subcommand)]
    pub command: Option<Subcommand>,

    #[structopt(
        long = "verbose",
        help = "Enables verbose diagnostics",
        global = true,
        aliases(&["debug"]),
    )]
    pub verbose: bool,

    #[structopt(
        long = "quiet",
        help = "Prevents unnecessary output",
        global = true,
        conflicts_with = "verbose",
        aliases(&["silent"]),
    )]
    pub quiet: bool,
}

impl Apollo {
    pub fn run(self, session: &mut Session) -> Fallible<ExitCode> {
        if let Some(command) = self.command {
            command.run(session)
        } else {
            Apollo::from_iter([&command_name(), "help"].iter()).run(session)
        }
    }
}

#[derive(StructOpt)]
pub enum Subcommand {
    #[structopt(name = "update")]
    ///  🚀  update the Apollo CLI
    Update(commands::Update),

    #[structopt(name = "print", setting = AppSettings::Hidden)]
    ///  🖨   parse and pretty print schemas to stdout
    Print(commands::Print),
    #[structopt(name = "setup", setting = AppSettings::Hidden)]
    ///  🚜  setup the Apollo toolchain in your environment
    Setup(commands::Setup),
}

impl Subcommand {
    pub fn run(self, session: &mut Session) -> Fallible<ExitCode> {
        match self {
            Subcommand::Update(update) => update.run(session),
            Subcommand::Print(print) => print.run(session),
            Subcommand::Setup(setup) => setup.run(session),
        }
    }
}
