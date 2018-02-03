use tokenizer::TokenStream;

use combine::{parser, ParseResult, Parser};
use combine::combinator::{many1, eof};

use query_error::{InternalError as Error, QueryParseError};
use query::*;

pub fn definition<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Definition, TokenStream<'a>>
{
    unimplemented!();
}

pub fn parse_query(s: &str) -> Result<Document, QueryParseError> {
    let tokens = TokenStream::new(s);
    let (doc, _) = many1(parser(definition))
        .map(|d| Document { definitions: d })
        .skip(eof())
        .parse(tokens)?;
    Ok(doc)
}

#[cfg(test)]
mod test {
    
    #[test]
    fn ast() {
        
    }
}
