use graphql_parser::parse_schema;
use std::fs;

use crate::command_config::Print;

pub fn print(opts: &Print) {
  opts.file.iter().for_each(move |file| {
    let schema = fs::read_to_string(file).expect("reading schema");
    let doc = parse_schema::<&str>(&schema).expect("parsing schema");
    if !opts.no_headers && opts.file.len() > 1 {
      println!("# {}", file.to_str().expect("filename"));
    }
    println!("{}", doc);
  })
}

#[test]
fn does_not_fail_with_no_files() {
  print(&Print { file: vec![], no_headers: false });
  print(&Print { file: vec![], no_headers: true });
}
