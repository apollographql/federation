// use serde_json::json;

// fn main() {
//     let message = json!({
//         "message": "hello world"s
//     });

//     println!("{}", message.to_string());
// }

extern crate clap;
use clap::{App, Arg, SubCommand};
use graphql_parser::parse_schema;
use std::fs;

fn main() {
    let matches = App::new("apollo")
        .version("0.1")
        .subcommand(
            SubCommand::with_name("print")
                .about("parse and pretty print schemas")
                .arg(
                    Arg::with_name("file")
                        .index(1)
                        .multiple(true)
                        .required(true)
                        .help("schemas to print"),
                ),
        )
        .get_matches();

    match matches.subcommand() {
        ("print", Some(opts)) => print(&mut opts.values_of("file").unwrap()),
        _ => println!("{}", matches.usage()),
    }
}

fn print(files: &mut dyn Iterator<Item = &str>) {
    files.for_each(move |file| {
        let schema = fs::read_to_string(file).expect("reading schema");
        let doc = parse_schema::<&str>(&schema).expect("parsing schema");
        println!("{}", doc);
    })
}
