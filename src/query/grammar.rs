use combine::{parser, ParseResult, Parser};
use combine::combinator::{many1, eof, optional, position};

use common::{Directive};
use common::{directives, arguments, default_value, parse_type};
use tokenizer::{TokenStream};
use helpers::{punct, ident, name};
use query::error::{ParseError};
use query::ast::*;

pub fn field<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Field, TokenStream<'a>>
{
    (
        position(),
        name(),
        optional(punct(":").with(name())),
        parser(arguments),
        parser(directives),
        optional(parser(selection_set)),
    ).map(|(position, name_or_alias, opt_name, arguments, directives, sel)| {
        let (name, alias) = match opt_name {
            Some(name) => (name, Some(name_or_alias)),
            None => (name_or_alias, None),
        };
        Field {
            position, name, alias, arguments, directives,
            selection_set: sel.unwrap_or_else(|| {
                SelectionSet {
                    span: (position, position),
                    items: Vec::new(),
                }
            }),
        }
    })
    .parse_stream(input)
}

pub fn selection<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Selection, TokenStream<'a>>
{
    parser(field).map(Selection::Field)
    .or(punct("...").with((
                position(),
                optional(ident("on").with(name()).map(TypeCondition::On)),
                parser(directives),
                parser(selection_set),
            ).map(|(position, type_condition, directives, selection_set)| {
                InlineFragment { position, type_condition,
                                 selection_set, directives }
            })
            .map(Selection::InlineFragment)
        .or((position(),
             name(),
             parser(directives),
            ).map(|(position, fragment_name, directives)| {
                FragmentSpread { position, fragment_name, directives }
            })
            .map(Selection::FragmentSpread))
    ))
    .parse_stream(input)
}

pub fn selection_set<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<SelectionSet, TokenStream<'a>>
{
    (
        position().skip(punct("{")),
        many1(parser(selection)),
        position().skip(punct("}")),
    ).map(|(start, items, end)| SelectionSet { span: (start, end), items })
    .parse_stream(input)
}

pub fn query<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Query, TokenStream<'a>>
{
    position()
    .skip(ident("query"))
    .and(parser(operation_common))
    .map(|(position, (name, variable_definitions, directives, selection_set))|
        Query {
            position, name, selection_set, variable_definitions, directives,
        })
    .parse_stream(input)
}

/// A set of attributes common to a Query and a Mutation
type OperationCommon = (
    Option<String>,
    Vec<VariableDefinition>,
    Vec<Directive>,
    SelectionSet,
);

pub fn operation_common<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<OperationCommon, TokenStream<'a>>
{
    optional(name())
    .and(optional(
        punct("(")
        .with(many1(
            (
                position(),
                punct("$").with(name()).skip(punct(":")),
                parser(parse_type),
                optional(
                    punct("=")
                    .with(parser(default_value))),
            ).map(|(position, name, var_type, default_value)| {
                VariableDefinition {
                    position, name, var_type, default_value,
                }
            })))
        .skip(punct(")")))
        .map(|vars| vars.unwrap_or_else(Vec::new)))
    .and(parser(directives))
    .and(parser(selection_set))
    .map(|(((a, b), c), d)| (a, b, c, d))
    .parse_stream(input)
}

pub fn mutation<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Mutation, TokenStream<'a>>
{
    position()
    .skip(ident("mutation"))
    .and(parser(operation_common))
    .map(|(position, (name, variable_definitions, directives, selection_set))|
        Mutation {
            position, name, selection_set, variable_definitions, directives,
        })
    .parse_stream(input)
}

pub fn subscription<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Subscription, TokenStream<'a>>
{
    position()
    .skip(ident("subscription"))
    .and(parser(operation_common))
    .map(|(position, (name, variable_definitions, directives, selection_set))|
        Subscription {
            position, name, selection_set, variable_definitions, directives,
        })
    .parse_stream(input)
}

pub fn operation_definition<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<OperationDefinition, TokenStream<'a>>
{
    parser(selection_set).map(OperationDefinition::SelectionSet)
    .or(parser(query).map(OperationDefinition::Query))
    .or(parser(mutation).map(OperationDefinition::Mutation))
    .or(parser(subscription).map(OperationDefinition::Subscription))
    .parse_stream(input)
}

pub fn fragment_definition<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<FragmentDefinition, TokenStream<'a>>
{
    (
        position().skip(ident("fragment")),
        name(),
        ident("on").with(name()).map(TypeCondition::On),
        parser(directives),
        parser(selection_set)
    ).map(|(position, name, type_condition, directives, selection_set)| {
        FragmentDefinition {
            position, name, type_condition, directives, selection_set,
        }
    })
    .parse_stream(input)
}

pub fn definition<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Definition, TokenStream<'a>>
{
    parser(operation_definition).map(Definition::Operation)
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
    use position::Pos;
    use query::grammar::*;
    use super::parse_query;

    fn ast(s: &str) -> Document {
        parse_query(s).unwrap()
    }

    #[test]
    fn one_field() {
        assert_eq!(ast("{ a }"), Document {
            definitions: vec![
                Definition::Operation(OperationDefinition::SelectionSet(
                    SelectionSet {
                        span: (Pos { line: 1, column: 1 },
                               Pos { line: 1, column: 5 }),
                        items: vec![
                            Selection::Field(Field {
                                position: Pos { line: 1, column: 3 },
                                alias: None,
                                name: "a".into(),
                                arguments: Vec::new(),
                                directives: Vec::new(),
                                selection_set: SelectionSet {
                                    span: (Pos { line: 1, column: 3 },
                                           Pos { line: 1, column: 3 }),
                                    items: Vec::new()
                                },
                            }),
                        ],
                    }
                ))
            ],
        });
    }

    #[test]
    fn builtin_values() {
        assert_eq!(ast("{ a(t: true, f: false, n: null) }"),
            Document {
                definitions: vec![
                    Definition::Operation(OperationDefinition::SelectionSet(
                        SelectionSet {
                            span: (Pos { line: 1, column: 1 },
                                   Pos { line: 1, column: 33 }),
                            items: vec![
                                Selection::Field(Field {
                                    position: Pos { line: 1, column: 3 },
                                    alias: None,
                                    name: "a".into(),
                                    arguments: vec![
                                        ("t".to_string(),
                                            Value::Boolean(true)),
                                        ("f".to_string(),
                                            Value::Boolean(false)),
                                        ("n".to_string(),
                                            Value::Null),
                                    ],
                                    directives: Vec::new(),
                                    selection_set: SelectionSet {
                                        span: (Pos { line: 1, column: 3 },
                                               Pos { line: 1, column: 3 }),
                                        items: Vec::new()
                                    },
                                }),
                            ],
                        }
                    ))
                ],
            });
    }

    #[test]
    fn one_field_roundtrip() {
        assert_eq!(ast("{ a }").to_string(), "{\n  a\n}\n");
    }

    #[test]
    #[should_panic(expected="number too large")]
    fn large_integer() {
        ast("{ a(x: 10000000000000000000000000000 }");
    }
}
