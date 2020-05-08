use graphql_parser::parse_schema;
use std::fs;
use std::path::PathBuf;
use structopt::StructOpt;

use crate::commands::Command;
use crate::errors::{ExitCode, Fallible};

#[derive(StructOpt)]
#[structopt(rename_all = "kebab-case")]
pub struct Print {
    #[structopt(short = "h", long)]
    /// suppress headers when printing multiple files
    pub no_headers: bool,

    #[structopt(parse(from_os_str))]
    /// schemas to print
    pub files: Vec<PathBuf>,
}

impl Command for Print {
    fn run(self) -> Fallible<ExitCode> {
        let printing_headers = !self.no_headers && self.files.len() > 1;
        self.files.iter().for_each(move |file| {
            let schema = fs::read_to_string(file).expect("reading schema");
            let doc = parse_schema::<&str>(&schema).expect("parsing schema");
            if printing_headers {
                println!("# {}", file.to_str().expect("filename"));
            }
            println!("{}", doc);
        });

        Ok(ExitCode::Success)
    }
}

#[test]
fn does_not_fail_with_no_files() -> std::io::Result<()> {
    Print {
        files: vec![],
        no_headers: false,
    }
    .run()
    .expect("failed to print");

    Print {
        files: vec![],
        no_headers: true,
    }
    .run()
    .expect("failed to print with no_headers");

    Ok(())
}
