#[macro_export]
macro_rules! tests_for_parser {
    ($parser: ident, $name: ident, $input: expr, $expected: expr) => {
        paste::item! {
            /// test roundtrip from source with unix line endings
            #[test] fn [<$parser __ $name __ unix>]() {
                let input = $input.replace("\r\n", "\n");
                let expected = $expected.replace("\r\n", "\n");
                let result = $parser::<String>(&input);
                assert_debug_snapshot!(result);
                if let Ok(ast) = result {
                    assert_eq!(ast.to_string(), expected);
                }
            }

            /// test roundtrip from source with windows line endings
            #[test] fn [<$parser __ $name __ win>]() {
                // this is weird, but ensures all line endings are windows line endings
                let input = $input.replace("\r\n", "\n").replace("\n", "\r\n");
                // always expect unix line endings as output
                let expected = $expected.replace("\r\n", "\n");
                let result = $parser::<String>(&input);
                assert_debug_snapshot!(result);
                if let Ok(ast) = result {
                    assert_eq!(ast.to_string(), expected);
                }
            }
        }
    }
}

#[macro_export]
macro_rules! test {
    ($name: ident, $input: expr, $expected: expr) => {
        tests_for_parser!(parse_query, $name, $input, $expected);
        tests_for_parser!(parse_schema, $name, $input, $expected);
    }
}
