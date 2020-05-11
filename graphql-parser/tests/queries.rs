extern crate graphql_parser;
#[cfg(test)] #[macro_use] extern crate pretty_assertions;
use insta::assert_debug_snapshot;

use std::io::Read;
use std::fs::File;

use graphql_parser::parse_query;

/// Test a parse_query roundtrip.
///
/// Assumes the source is already in canonical form and validates the intermediate
/// Result with a snapshot test.
fn test(filename: &str) {
    let mut buf = String::with_capacity(1024);
    let path = format!("tests/queries/{}.graphql", filename);
    let mut f = File::open(&path).unwrap();
    f.read_to_string(&mut buf).unwrap();
    let result = parse_query::<String>(&buf);       
    assert_debug_snapshot!(filename, result);
    if let Ok(ast) = result {
        let buf = buf.replace("\r\n", "\n");
        assert_eq!(ast.to_string(), buf);
    }
}

/// Test a parse_query roundtrip, comparing the parsed string against a non-canonical
///
/// Takes a second filename which holds the tree in canonical form.
fn test_canonical(filename: &str, canonical_filename: &str) {
    let mut buf = String::with_capacity(1024);
    let source = format!("tests/queries/{}.graphql", filename);
    let target = format!("tests/queries/{}.graphql", canonical_filename);
    let mut f = File::open(&source).unwrap();
    f.read_to_string(&mut buf).unwrap();
    let result = parse_query::<String>(&buf);
    assert_debug_snapshot!(filename, result);

    // read the canonical representation
    let mut buf = String::with_capacity(buf.capacity());
    let mut f = File::open(&target).unwrap();
    f.read_to_string(&mut buf).unwrap();

    if let Ok(ast) = result {
        let buf = buf.replace("\r\n", "\n");
        assert_eq!(ast.to_string(), buf);
    }
}

#[test] fn minimal() { test("minimal"); }
#[test] fn minimal_query() { test("minimal_query"); }
#[test] fn named_query() { test("named_query"); }
#[test] fn query_vars() { test("query_vars"); }
#[test] fn query_var_defaults() { test("query_var_defaults"); }
#[test] fn query_var_defaults1() { test("query_var_default_string"); }
#[test] fn query_var_defaults2() { test("query_var_default_float"); }
#[test] fn query_var_defaults3() { test("query_var_default_list"); }
#[test] fn query_var_defaults4() { test("query_var_default_object"); }
#[test] fn query_aliases() { test("query_aliases"); }
#[test] fn query_arguments() { test("query_arguments"); }
#[test] fn query_directive() { test("query_directive"); }
#[test] fn mutation_directive() { test("mutation_directive"); }
#[test] fn subscription_directive() { test("subscription_directive"); }
#[test] fn string_literal() { test("string_literal"); }
#[test] fn triple_quoted_literal() { test("triple_quoted_literal"); }
#[test] fn query_list_arg() { test("query_list_argument"); }
#[test] fn query_object_arg() { test("query_object_argument"); }
#[test] fn nested_selection() { test("nested_selection"); }
#[test] fn inline_fragment() { test("inline_fragment"); }
#[test] fn inline_fragment_dir() { test("inline_fragment_dir"); }
#[test] fn fragment_spread() { test("fragment_spread"); }
#[test] fn minimal_mutation() { test("minimal_mutation"); }
#[test] fn fragment() { test("fragment"); }
#[test] fn directive_args() { test("directive_args"); }
#[test] fn kitchen_sink() { test_canonical("kitchen-sink", "kitchen-sink_canonical"); }
#[test] fn fail_querry() { test("fail_querry"); }
#[test] fn fail_bad_args() { test("fail_bad_args"); }
