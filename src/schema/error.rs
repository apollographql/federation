use combine::easy::Errors;

use tokenizer::Token;
use position::Pos;

pub type InternalError<'a> = Errors<Token<'a>, Token<'a>, Pos>;


/// Error parsing schema
///
/// This structure is opaque for forward compatibility. We are exploring a
/// way to improve both error message and API.
#[derive(Fail, Debug)]
#[fail(display="schema parse error: {}", _0)]
pub struct SchemaParseError(String);

impl<'a> From<InternalError<'a>> for SchemaParseError {
    fn from(e: InternalError<'a>) -> SchemaParseError {
        SchemaParseError(format!("{}", e))
    }
}
