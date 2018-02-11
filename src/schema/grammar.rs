use combine::{parser, ParseResult, Parser};
use combine::easy::Error;
use combine::error::StreamError;
use combine::combinator::{many, many1, eof, optional, position};

use tokenizer::{Kind as T, Token, TokenStream};
use helpers::{punct, ident, kind, name};
use schema::error::{SchemaParseError};
use schema::ast::*;


pub fn definition<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Definition, TokenStream<'a>>
{
    unimplemented!();
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
            ],
        });
    }
}
