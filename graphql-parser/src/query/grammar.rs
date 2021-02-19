use combine::parser::choice::{choice, optional};
use combine::parser::item::{eof, position};
use combine::parser::repeat::many1;
use combine::{parser, ParseResult, Parser};

use crate::common::{arguments, default_value, directives, parse_type};
use crate::helpers::{ident, name, punct};
use crate::query::ast::*;
use crate::tokenizer::TokenStream;
use crate::ParseError;

pub fn field<'a>(input: &mut TokenStream<'a>) -> ParseResult<Field<'a>, TokenStream<'a>> {
    (
        position(),
        name::<'a>(),
        optional(punct(":").with(name::<'a>())),
        parser(arguments),
        parser(directives),
        optional(parser(selection_set)),
    )
        .map(
            |(position, name_or_alias, opt_name, arguments, directives, sel)| {
                let (name, alias) = match opt_name {
                    Some(name) => (name, Some(name_or_alias)),
                    None => (name_or_alias, None),
                };
                Field {
                    position,
                    name,
                    alias,
                    arguments,
                    directives,
                    selection_set: sel.unwrap_or_else(|| SelectionSet {
                        span: (position, position),
                        items: Vec::new(),
                    }),
                }
            },
        )
        .parse_stream(input)
}

pub fn selection<'a>(input: &mut TokenStream<'a>) -> ParseResult<Selection<'a>, TokenStream<'a>> {
    parser(field)
        .map(Selection::Field)
        .or(punct("...").with(
            (
                position(),
                optional(ident("on").with(name::<'a>())),
                parser(directives),
                parser(selection_set),
            )
                .map(
                    |(position, type_condition, directives, selection_set)| InlineFragment {
                        position,
                        type_condition,
                        selection_set,
                        directives,
                    },
                )
                .map(Selection::InlineFragment)
                .or((position(), name::<'a>(), parser(directives))
                    .map(|(position, fragment_name, directives)| FragmentSpread {
                        position,
                        fragment_name,
                        directives,
                    })
                    .map(Selection::FragmentSpread)),
        ))
        .parse_stream(input)
}

pub fn selection_set<'a>(
    input: &mut TokenStream<'a>,
) -> ParseResult<SelectionSet<'a>, TokenStream<'a>> {
    (
        position().skip(punct("{")),
        many1(parser(selection)),
        position().skip(punct("}")),
    )
        .map(|(start, items, end)| SelectionSet {
            span: (start, end),
            items,
        })
        .parse_stream(input)
}

pub fn operation_definition<'a>(
    input: &mut TokenStream<'a>,
) -> ParseResult<OperationDefinition<'a>, TokenStream<'a>> {
    (
        position(),
        choice((
            ident("query").map(|_| Operation::Query),
            ident("mutation").map(|_| Operation::Mutation),
            ident("subscription").map(|_| Operation::Subscription),
        )),
        optional(name::<'a>()),
        optional(
            punct("(")
                .with(many1(
                    (
                        position(),
                        punct("$").with(name::<'a>()).skip(punct(":")),
                        parser(parse_type),
                        optional(punct("=").with(parser(default_value))),
                    )
                        .map(|(position, name, var_type, default_value)| {
                            VariableDefinition {
                                position,
                                name,
                                var_type,
                                default_value,
                            }
                        }),
                ))
                .skip(punct(")")),
        )
        .map(|vars| vars.unwrap_or_else(Vec::new)),
        parser(directives),
        parser(selection_set),
    )
        .flat_map(
            |(position, kind, name, variable_definitions, directives, selection_set)| {
                Ok(OperationDefinition {
                    position,
                    description: None,
                    kind,
                    name,
                    variable_definitions,
                    directives,
                    selection_set,
                })
            },
        )
        .parse_stream(input)
}

pub fn fragment_definition<'a>(
    input: &mut TokenStream<'a>,
) -> ParseResult<FragmentDefinition<'a>, TokenStream<'a>> {
    (
        position().skip(ident("fragment")),
        name::<'a>(),
        ident("on").with(name::<'a>()),
        parser(directives),
        parser(selection_set),
    )
        .map(
            |(position, name, type_condition, directives, selection_set)| FragmentDefinition {
                position,
                description: None,
                name,
                type_condition,
                directives,
                selection_set,
            },
        )
        .parse_stream(input)
}

pub fn definition<'a>(input: &mut TokenStream<'a>) -> ParseResult<Definition<'a>, TokenStream<'a>> {
    parser(selection_set)
        .map(Definition::SelectionSet)
        .or(parser(operation_definition).map(Definition::Operation))
        .or(parser(fragment_definition).map(Definition::Fragment))
        .parse_stream(input)
}

/// Parses a piece of query language and returns an AST
pub fn parse_query(s: &str) -> Result<Document, ParseError> {
    let mut tokens = TokenStream::new(s);
    let (doc, _) = many1(parser(definition))
        .map(|d| Document { definitions: d })
        .skip(eof())
        .parse_stream(&mut tokens)
        .map_err(|e| e.into_inner().error)?;

    Ok(doc)
}

#[cfg(test)]
mod test {
    use super::{Definition, Document, Field, Selection, SelectionSet, Value};
    use crate::position::Pos;
    use crate::query::grammar::*;

    fn ast(s: &str) -> Document {
        parse_query(&s).unwrap()
    }

    #[test]
    fn one_field() {
        assert_eq!(
            ast("{ a }"),
            Document {
                definitions: vec![Definition::SelectionSet(SelectionSet {
                    span: (Pos { line: 1, column: 1 }, Pos { line: 1, column: 5 }),
                    items: vec![Selection::Field(Field {
                        position: Pos { line: 1, column: 3 },
                        alias: None,
                        name: "a",
                        arguments: Vec::new(),
                        directives: Vec::new(),
                        selection_set: SelectionSet {
                            span: (Pos { line: 1, column: 3 }, Pos { line: 1, column: 3 }),
                            items: Vec::new()
                        },
                    }),],
                })],
            }
        );
    }

    #[test]
    fn builtin_values() {
        assert_eq!(
            ast("{ a(t: true, f: false, n: null) }"),
            Document {
                definitions: vec![Definition::SelectionSet(SelectionSet {
                    span: (
                        Pos { line: 1, column: 1 },
                        Pos {
                            line: 1,
                            column: 33
                        }
                    ),
                    items: vec![Selection::Field(Field {
                        position: Pos { line: 1, column: 3 },
                        alias: None,
                        name: "a",
                        arguments: vec![
                            ("t", Value::Boolean(true)),
                            ("f", Value::Boolean(false)),
                            ("n", Value::Null),
                        ],
                        directives: Vec::new(),
                        selection_set: SelectionSet {
                            span: (Pos { line: 1, column: 3 }, Pos { line: 1, column: 3 }),
                            items: Vec::new()
                        },
                    }),],
                })],
            }
        );
    }

    #[test]
    fn one_field_roundtrip() {
        assert_eq!(ast("{ a }").to_string(), "{\n  a\n}\n");
    }

    #[test]
    #[should_panic(expected = "number too large")]
    fn large_integer() {
        ast("{ a(x: 10000000000000000000000000000 }");
    }
}
