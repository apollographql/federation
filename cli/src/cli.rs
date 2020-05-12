use std::env::args;
use structopt::clap::AppSettings;
use structopt::StructOpt;

use crate::commands::{self, Command};
use crate::errors::{ExitCode, Fallible};

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
/// The [Experimental] Apollo CLI, for supporting all your graphql needs :)
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
    pub fn run(self) -> Fallible<ExitCode> {
        if let Some(command) = self.command {
            command.run()
        } else {
            run_command(&mut vec!["help".to_string()])
        }
    }
}

#[derive(StructOpt)]
pub enum Subcommand {
    #[structopt(name = "login")]
    ///  🔓  log in to apollo
    Login(commands::Login),

    #[structopt(name = "schema")]
    ///  ⚛   manage your schema
    Schema {
        #[structopt(subcommand)]
        command: Option<commands::schema::SchemaCommand>,
    },

    #[structopt(name = "print", setting = AppSettings::Hidden)]
    ///  🖨   parse and pretty print schemas to stdout
    Print(commands::Print),
    #[structopt(name = "setup", setting = AppSettings::Hidden)]
    ///  🚜  setup the Apollo toolchain in your environment
    Setup(commands::Setup),
}

impl Subcommand {
    pub fn run(self) -> Fallible<ExitCode> {
        match self {
            Subcommand::Login(login) => login.run(),
            Subcommand::Print(print) => print.run(),
            Subcommand::Setup(setup) => setup.run(),
            Subcommand::Schema { command } => match command {
                Some(cmd) => cmd.run(),
                None => run_command(&mut vec!["schema".to_string(), "help".to_string()]),
            },
        }
    }
}

fn run_command(cmd: &mut Vec<String>) -> Fallible<ExitCode> {
    // per the docs on std::env::arg
    // The first element is traditionally the path of the executable, but it can be set to
    // arbitrary text, and may not even exist. This means this property should not be
    // relied upon for security purposes.
    let command_name = args()
        .next()
        .expect("Called help without a path to the binary");

    cmd.insert(0, command_name);

    Apollo::from_iter(cmd.iter()).run()
}
