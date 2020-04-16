use crate::command_config::Print;
use crate::commands::Command;

use graphql_parser::parse_schema;
use std::fs;

impl Command for Print {
    fn run(&self) {
        self.file.iter().for_each(move |file| {
            let schema = fs::read_to_string(file).expect("reading schema");
            let doc = parse_schema::<&str>(&schema).expect("parsing schema");
            if !self.no_headers && self.file.len() > 1 {
                println!("# {}", file.to_str().expect("filename"));
            }
            println!("{}", doc);
        })
    }
}

#[test]
fn does_not_fail_with_no_files() {
    (Print {
        file: vec![],
        no_headers: false,
    })
    .run();
    (Print {
        file: vec![],
        no_headers: true,
    })
    .run();
}
