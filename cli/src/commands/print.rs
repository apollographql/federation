use graphql_parser::parse_schema;
use std::fs;
use std::path::PathBuf;
use structopt::StructOpt;

use crate::commands::Command;
use crate::errors::{ExitCode, Fallible};
use crate::telemetry::Session;

#[derive(StructOpt)]
#[structopt(rename_all = "kebab-case")]
pub struct Print {
    #[structopt(short = "h", long)]
    /// suppress headers when printing multiple files
    pub no_headers: bool,

    #[structopt(short = "s", long)]
    /// print the syntax tree
    pub ast: bool,

    #[structopt(parse(from_os_str))]
    /// schemas to print
    pub files: Vec<PathBuf>,
}

impl Command for Print {
    fn run(&self, _session: &mut Session) -> Fallible<ExitCode> {
        let printing_headers = !self.no_headers && self.files.len() > 1;
        self.files.iter().for_each(move |file| {
            let schema = fs::read_to_string(file).expect("reading schema");
            let doc = parse_schema::<&str>(&schema).expect("parsing schema");
            if printing_headers {
                println!("# {}", file.to_str().expect("filename"));
            }
            if self.ast {
                println!("{:#?}", doc)
            } else {
                println!("{}", doc);
            }
        });

        Ok(ExitCode::Success)
    }
}

#[test]
fn does_not_fail_with_no_files() -> std::io::Result<()> {
    Print {
        files: vec![],
        ast: false,
        no_headers: false,
    }
    .run(&mut Session::init())
    .expect("failed to print");

    Print {
        files: vec![],
        ast: false,
        no_headers: true,
    }
    .run(&mut Session::init())
    .expect("failed to print with no_headers");

    Ok(())
}
