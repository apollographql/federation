extern crate graphql_parser;
#[cfg(test)] #[macro_use] extern crate pretty_assertions;
use insta::assert_debug_snapshot;

use std::fs::read_to_string;
use std::path::Path;

use graphql_parser::parse_query;
use graphql_parser::parse_schema;

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

macro_rules! roundtrip_tester {
    ($func_name: ident, $parser: ident) => {
        /// Test a round trip through $parser.
        fn $func_name(src: &str) {
            let source_path = format!("tests/{}.graphql", src);

            let source = load(&source_path);
            let result_unix = $parser::<String>(&source.unix);
            assert_debug_snapshot!(
                format!("{}__{}", stringify!($parser), src),
                result_unix);
        
            let result_win = $parser::<String>(&source.win);
            assert_debug_snapshot!(
                format!("{}__{}_win", stringify!($parser), src),
                result_win);
        
            let canonical_path = format!("tests/{}.canonical.graphql", src);
            let canonical = if Path::new(&canonical_path).exists() {
                load(&canonical_path).unix
            } else {
                source.unix.to_owned()
            };
        
            for result in &[result_unix, result_win] {
                if let Ok(ast) = result {            
                    assert_eq!(ast.to_string(), canonical);
                }
            }
        }
    }
}

roundtrip_tester!(query, parse_query);
roundtrip_tester!(schema, parse_schema);

macro_rules! test {
    ($name: ident) => {
        paste::item! {
            #[test] fn [<query_ $name>]() {
                let name = stringify!($name);
                query(name);
            }

            #[test] fn [<schema_ $name>]() {
                let name = stringify!($name);
                schema(name);
            }
        }
    }
}

test!(very_minimal_query);
test!(minimal_query);
test!(named_query);
test!(query_vars);
test!(query_var_defaults);
test!(query_var_default_string);
test!(query_var_default_float);
test!(query_var_default_list);
test!(query_var_default_object);
test!(query_aliases);
test!(query_arguments);
test!(query_directive);
test!(mutation_directive);
test!(subscription_directive);
test!(string_literal);
test!(triple_quoted_literal);
test!(query_list_argument);
test!(query_object_argument);
test!(nested_selection);
test!(inline_fragment);
test!(inline_fragment_dir);
test!(fragment_spread);
test!(minimal_mutation);
test!(fragment);
test!(directive_args);
test!(kitchen_sink);
test!(fail_querry);
test!(fail_bad_args);

test!(minimal_schema);
test!(scalar_type);
test!(extend_scalar);
test!(minimal_type);
test!(implements);
test!(implements_amp);
test!(simple_object);
test!(extend_object);
test!(interface);
test!(extend_interface);
test!(union);
test!(empty_union);
test!(union_extension);
test!(enums);
test!(extend_enum);
test!(input_type);
test!(extend_input);
test!(directive);
test!(schema_kitchen_sink);
test!(directive_descriptions);
test!(fail_onion);
