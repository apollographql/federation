use structopt::StructOpt;

mod commands;
use commands::print;

mod command_config;
use command_config::Apollo;

fn main() {
    match Apollo::from_args() {
        Apollo::print { file } => {
            print::print(&mut file.into_iter());
        }
    }
}
