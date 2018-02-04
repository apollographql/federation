use combine::easy::Errors;

use tokenizer::Token;
use position::Pos;

pub type InternalError<'a> = Errors<Token<'a>, Token<'a>, Pos>;


/// Error parsing query
///
/// This structure is opaque for forward compatibility. We are exploring a
/// way to improve both error message and API.
#[derive(Fail, Debug)]
#[fail(display="query parse error: {}", _0)]
pub struct QueryParseError(String);

impl<'a> From<InternalError<'a>> for QueryParseError {
    fn from(e: InternalError<'a>) -> QueryParseError {
        QueryParseError(format!("{}", e))
    }
}
