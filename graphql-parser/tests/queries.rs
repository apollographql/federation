extern crate graphql_parser;
#[cfg(test)] #[macro_use] extern crate pretty_assertions;
use insta::assert_debug_snapshot;

use std::fs::read_to_string;
use std::path::Path;

use graphql_parser::parse_query;

/// A text file represented with two types of line endings.
struct TextFile {
    /// \n
    unix: String,

    /// \r\n
    win: String,
}

/// Load a text file, converting it to both windows and unix
/// line endings. Panics if src is unavailable.
fn load(filename: &str) -> TextFile {
    let unix = read_to_string(filename).unwrap().replace("\r\n", "\n");
    let win = unix.replace("\n", "\r\n");
    TextFile { unix, win }
}

/// Test a parse_query roundtrip, comparing the parsed string against a non-canonical
///
/// Takes a second filename which holds the tree in canonical form.
fn test(src: &str) {
    let source_path = format!("tests/queries/{}.graphql", src);

    let source = load(&source_path);
    let result_unix = parse_query::<String>(&source.unix);
    assert_debug_snapshot!(src, result_unix);

    let result_win = parse_query::<String>(&source.win);
    assert_debug_snapshot!(src.to_owned() + "_win", result_win);

    for result in &[result_unix, result_win] {
        if let Ok(ast) = result {
            let canonical_path = format!("tests/queries/{}.canonical.graphql", src);
            let canonical = if Path::new(&canonical_path).exists() {
                load(&canonical_path).unix
            } else {
                source.unix.to_owned()
            };
            assert_eq!(ast.to_string(), canonical);
        }
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
#[test] fn kitchen_sink() { test("kitchen-sink"); }
#[test] fn fail_querry() { test("fail_querry"); }
#[test] fn fail_bad_args() { test("fail_bad_args"); }
