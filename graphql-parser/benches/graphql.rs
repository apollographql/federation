#![feature(test)]
extern crate test;

extern crate graphql_parser;

use std::fs::File;
use std::io::Read;

use graphql_parser::parse_query;

fn load_file(name: &str) -> String {
    let mut buf = String::with_capacity(1024);
    let path = format!("tests/queries/{}.graphql", name);
    let mut f = File::open(&path).unwrap();
    f.read_to_string(&mut buf).unwrap();
    buf
}

#[bench]
fn bench_minimal(b: &mut test::Bencher) {
    let f = load_file("minimal");
    b.iter(|| parse_query::<String>(&f).unwrap());
}

#[bench]
fn bench_inline_fragment(b: &mut test::Bencher) {
    let f = load_file("inline_fragment");
    b.iter(|| parse_query::<String>(&f).unwrap());
}

#[bench]
fn bench_directive_args(b: &mut test::Bencher) {
    let f = load_file("directive_args");
    b.iter(|| parse_query::<String>(&f).unwrap());
}

#[bench]
fn bench_query_vars(b: &mut test::Bencher) {
    let f = load_file("query_vars");
    b.iter(|| parse_query::<String>(&f).unwrap());
}

#[bench]
fn bench_kitchen_sink(b: &mut test::Bencher) {
    let f = load_file("kitchen-sink");
    b.iter(|| parse_query::<String>(&f).unwrap());
}
