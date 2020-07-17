#[macro_export]
macro_rules! tests_for_parser {
    ($parser: ident, $name: ident, $input: expr, $expected: expr) => {
        paste::item! {
            /// test roundtrip from source with unix line endings
            #[test] fn [<$name __ $parser __ unix>]() {
                let input = $input.replace("\r\n", "\n");
                let expected = $expected.replace("\r\n", "\n");
                let result = $parser(&input);
                assert_snapshot!(
                    stringify!([<$name __ $parser __ unix>]),
                    format!("{}\n---\n{:#?}", &input, &result));
                if let Ok(ast) = result {
                    assert_eq!(ast.to_string(), expected);
                    assert_snapshot!(
                        stringify!([<$name __ visit _ $parser __ win>]),
                        format!("{}\n---\n{:#?}", &input, [<visit _ $parser>](&ast)));
                }
            }

            /// test roundtrip from source with windows line endings
            #[test] fn [<$name __ $parser __ win>]() {
                // this is weird, but ensures all line endings are windows line endings
                let input = $input.replace("\r\n", "\n").replace("\n", "\r\n");
                // always expect unix line endings as output
                let expected = $expected.replace("\r\n", "\n");
                let result = $parser(&input);
                assert_snapshot!(
                    stringify!([<$name __ $parser __ win>]),
                    format!("{}\n---\n{:#?}", &$input.replace("\r\n", "\n"), &result));
                if let Ok(ast) = result {
                    assert_eq!(ast.to_string(), expected);
                    assert_snapshot!(
                        stringify!([<$name __ visit _ $parser __ win>]),
                        format!("{}\n---\n{:#?}", &$input.replace("\r\n", "\n"), &[<visit _ $parser>](&ast)));
                }
            }
        }
    };
}

#[macro_export]
macro_rules! test {
    ($name: ident, $input: expr, $expected: expr) => {
        tests_for_parser!(parse_query, $name, $input, $expected);
        tests_for_parser!(parse_schema, $name, $input, $expected);
    };
}

use graphql_parser::{query, query::Node as QueryNode, schema, schema::Node as SchemaNode, Name};

pub fn visit_parse_query<'a>(doc: &query::Document<'a>) -> Print {
    let mut p = Print::default();
    doc.accept(&mut p);
    p
}

pub fn visit_parse_schema<'a>(doc: &schema::Document<'a>) -> Print {
    let mut p = Print::default();
    doc.accept(&mut p);
    p
}

#[derive(Debug, Default)]
pub struct Print {
    output: Vec<Visit>,
}

#[derive(Debug)]
pub struct Visit {
    event: String,
    name: Option<String>,
}

macro_rules! print {
    ($action:ident $mod:ident :: $Type:ident) => {
        fn $action<'a>(&'a mut self, node: &'q $mod::$Type<'q>)
        where
            'q: 'a,
        {
            self.output.push(Visit {
                event: String::from(stringify!($action)),
                name: node.name().map(String::from),
            })
        }
    };
}

impl<'q> query::Visitor<'q> for Print {
    print!(enter_query query::Document);
    print!(leave_query query::Document);
    print!(enter_query_def query::Definition);
    print!(leave_query_def query::Definition);
    print!(enter_sel_set query::SelectionSet);
    print!(leave_sel_set query::SelectionSet);
    print!(enter_sel query::Selection);
    print!(leave_sel query::Selection);
}

impl<'q> schema::Visitor<'q> for Print {
    print!(enter_schema schema::Document);
    print!(enter_schema_def schema::Definition);
    print!(enter_field schema::Field);
    print!(leave_field schema::Field);
    print!(leave_schema_def schema::Definition);
    print!(leave_schema schema::Document);
}
