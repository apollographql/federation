#![feature(test)]
extern crate test;

extern crate graphql_parser;

use graphql_parser::{parse_query, parse_schema};

#[bench]
fn bench_minimal(b: &mut test::Bencher) {
    let src = include_str!("../tests/minimal_query.graphql");
    b.iter(|| parse_query(src).unwrap());
}

#[bench]
fn bench_inline_fragment(b: &mut test::Bencher) {
    let src = include_str!("../tests/inline_fragment.graphql");
    b.iter(|| parse_query(src).unwrap());
}

#[bench]
fn bench_directive_args(b: &mut test::Bencher) {
    let src = include_str!("../tests/directive_args.graphql");
    b.iter(|| parse_query(src).unwrap());
}

#[bench]
fn bench_query_vars(b: &mut test::Bencher) {
    let src = include_str!("../tests/query_vars.graphql");
    b.iter(|| parse_query(src).unwrap());
}

#[bench]
fn bench_kitchen_sink(b: &mut test::Bencher) {
    let src = include_str!("../tests/query_kitchen_sink.graphql");
    b.iter(|| parse_query(src).unwrap());
}

#[bench]
fn bench_github(b: &mut test::Bencher) {
    let src = include_str!("samples/github.graphql");
    b.iter(|| parse_schema(src));
}
