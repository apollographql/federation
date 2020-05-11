extern crate graphql_parser;
#[cfg(test)] #[macro_use] extern crate pretty_assertions;
use insta::assert_debug_snapshot;

use std::io::Read;
use std::fs::File;

use graphql_parser::parse_schema;

/// Test a parse_schema roundtrip.
///
/// Assumes the source is already in canonical form and validates the intermediate
/// Result with a snapshot test.
fn test(filename: &str) {
    let mut buf = String::with_capacity(1024);
    let path = format!("tests/schemas/{}.graphql", filename);
    let mut f = File::open(&path).unwrap();
    f.read_to_string(&mut buf).unwrap();
    let result = parse_schema::<String>(&buf);
    assert_debug_snapshot!(filename, result);
    if let Ok(ast) = result {
        let buf = buf.replace("\r\n", "\n");
        assert_eq!(ast.to_string(), buf);
    }
}

/// Test a parse_schema roundtrip, comparing the parsed string against a non-canonical
///
/// Takes a second filename which holds the tree in canonical form.
fn test_canonical(filename: &str, canonical_filename: &str) {
    let mut buf = String::with_capacity(1024);
    let source = format!("tests/schemas/{}.graphql", filename);
    let target = format!("tests/schemas/{}.graphql", canonical_filename);
    let mut f = File::open(&source).unwrap();
    f.read_to_string(&mut buf).unwrap();
    let result = parse_schema::<String>(&buf);
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
#[test] fn scalar_type() { test("scalar_type"); }
#[test] fn extend_scalar() { test("extend_scalar"); }
#[test] fn minimal_type() { test("minimal_type"); }
#[test] fn implements() { test("implements"); }
#[test] fn implements_amp() { test_canonical("implements_amp", "implements_amp_canonical"); }
#[test] fn simple_object() { test("simple_object"); }
#[test] fn extend_object() { test("extend_object"); }
#[test] fn interface() { test("interface"); }
#[test] fn extend_interface() { test("extend_interface"); }
#[test] fn union() { test("union"); }
#[test] fn empty_union() { test("empty_union"); }
#[test] fn union_extension() { test("union_extension"); }
#[test] fn enum_type() { test("enum"); }
#[test] fn extend_enum() { test("extend_enum"); }
#[test] fn input_type() { test("input_type"); }
#[test] fn extend_input() { test_canonical("extend_input", "extend_input_canonical"); }
#[test] fn directive() { test("directive"); }
#[test] fn kitchen_sink() { test_canonical("kitchen-sink", "kitchen-sink_canonical"); }
#[test] fn directive_descriptions() { test_canonical("directive_descriptions", "directive_descriptions_canonical"); }
