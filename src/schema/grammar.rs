use combine::{parser, ParseResult, Parser};
use combine::easy::{Error, Errors};
use combine::error::StreamError;
use combine::combinator::{many, many1, eof, optional, position, choice};

use tokenizer::{Kind as T, Token, TokenStream};
use helpers::{punct, ident, kind, name};
use common::directives;
use schema::error::{SchemaParseError};
use schema::ast::*;


pub fn schema<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<SchemaDefinition, TokenStream<'a>>
{
    (
        position().skip(ident("schema")),
        parser(directives),
        punct("{")
            .with(many((
                kind(T::Name).skip(punct(":")),
                name(),
            )))
            .skip(punct("}")),
    )
    .flat_map(|(position, directives, operations): (_, _, Vec<(Token, _)>)| {
        let mut query = None;
        let mut mutation = None;
        let mut subscription = None;
        let mut err = Errors::empty(position);
        for (oper, type_name) in operations {
            match oper.value {
                "query" if query.is_some() => {
                    err.add_error(Error::unexpected_static_message(
                        "duplicate `query` operation"));
                }
                "query" => {
                    query = Some(type_name);
                }
                "mutation" if mutation.is_some() => {
                    err.add_error(Error::unexpected_static_message(
                        "duplicate `mutation` operation"));
                }
                "mutation" => {
                    mutation = Some(type_name);
                }
                "subscription" if subscription.is_some() => {
                    err.add_error(Error::unexpected_static_message(
                        "duplicate `subscription` operation"));
                }
                "subscription" => {
                    subscription = Some(type_name);
                }
                _ => {
                    err.add_error(Error::unexpected_token(oper));
                    err.add_error(
                        Error::expected_static_message("query"));
                    err.add_error(
                        Error::expected_static_message("mutation"));
                    err.add_error(
                        Error::expected_static_message("subscription"));
                }
            }
        }
        if !err.errors.is_empty() {
            return Err(err);
        }
        Ok(SchemaDefinition {
            position, directives, query, mutation, subscription,
        })
    })
    .parse_stream(input)
}


pub fn definition<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Definition, TokenStream<'a>>
{
    parser(schema).map(Definition::SchemaDefinition)
    .parse_stream(input)
}

/// Parses a piece of schema language and returns an AST
pub fn parse_schema(s: &str) -> Result<Document, SchemaParseError> {
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
    use schema::grammar::*;
    use super::parse_schema;

    fn ast(s: &str) -> Document {
        parse_schema(s).unwrap()
    }

    #[test]
    fn one_field() {
        assert_eq!(ast("schema { query: Query }"), Document {
            definitions: vec![
                Definition::SchemaDefinition(
                    SchemaDefinition {
                        position: Pos { line: 1, column: 1 },
                        directives: vec![],
                        query: Some("Query".into()),
                        mutation: None,
                        subscription: None
                    }
                )
            ],
        });
    }
}
