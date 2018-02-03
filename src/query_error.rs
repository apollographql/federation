use combine::easy::Error;

use tokenizer::Token;
use position::Pos;

pub type InternalError<'a> = Error<Token<'a>, Token<'a>>;


#[derive(Fail, Debug)]
#[fail(display="query parse error: {}", _0)]
pub struct QueryParseError(String);

impl<'a> From<InternalError<'a>> for QueryParseError {
    fn from(e: InternalError<'a>) -> QueryParseError {
        QueryParseError(format!("{}", e))
    }
}
