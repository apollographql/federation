use crate::commands::Command;

use graphql_parser::parse_schema;
use std::fs;
use std::path::PathBuf;
use structopt::StructOpt;

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
    fn run(self) {
        let printing_headers = !self.no_headers && self.files.len() > 1;
        self.files.iter().for_each(move |file| {
            let schema = fs::read_to_string(file).expect("reading schema");
            let doc = parse_schema::<&str>(&schema).expect("parsing schema");
            if printing_headers {
                println!("# {}", file.to_str().expect("filename"));
            }
            println!("{}", doc);
        })
    }
}

#[test]
fn does_not_fail_with_no_files() {
    Print {
        files: vec![],
        no_headers: false,
    }
    .run();
    Print {
        files: vec![],
        no_headers: true,
    }
    .run();
}
