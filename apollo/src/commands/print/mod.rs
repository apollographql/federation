use graphql_parser::parse_schema;
use std::fs;

pub fn print(files: &mut dyn Iterator<Item = std::path::PathBuf>) {
  println!("{:?}", std::env::current_dir());
  files.for_each(move |file| {
    let schema = fs::read_to_string(file).expect("reading schema");
    let doc = parse_schema::<&str>(&schema).expect("parsing schema");
    println!("{}", doc);
  })
}

#[test]
fn does_not_fail_with_no_files() {
  print(&mut vec![].into_iter());
}
