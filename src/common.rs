use std::collections::BTreeMap;

use combine::{parser, ParseResult, Parser};
use combine::easy::Error;
use combine::error::StreamError;
use combine::combinator::{many, many1, optional, position, choice};

use tokenizer::{Kind as T, Token, TokenStream};
use helpers::{punct, ident, kind, name};
use position::Pos;


/// An alias for string, used where graphql expects a name
pub type Name = String;

#[derive(Debug, Clone, PartialEq)]
pub struct Directive {
    pub position: Pos,
    pub name: Name,
    pub arguments: Vec<(Name, Value)>,
}

/// This represents integer number
///
/// But since there is no definition on limit of number in spec
/// (only in implemetation), we do a trick similar to the one
/// in `serde_json`: encapsulate value in new-type, allowing type
/// to be extended later.
#[derive(Debug, Clone, PartialEq)]
// we use i64 as a reference implementation: graphql-js thinks even 32bit
// integers is enough. We might consider lift this limit later though
pub struct Number(pub(crate) i64);

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Variable(Name),
    Int(Number),
    Float(f64),
    String(String),
    Boolean(bool),
    Null,
    Enum(Name),
    List(Vec<Value>),
    Object(BTreeMap<Name, Value>),
}

#[derive(Debug, Clone, PartialEq)]
pub enum Type {
    NamedType(Name),
    ListType(Box<Type>),
    NonNullType(Box<Type>),
}

impl Number {
    /// Returns a number as i64 if it fits the type
    pub fn as_i64(&self) -> Option<i64> {
        Some(self.0)
    }
}

impl From<i32> for Number {
    fn from(i: i32) -> Self {
        Number(i as i64)
    }
}

pub fn directives<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Vec<Directive>, TokenStream<'a>>
{
    many(position()
        .skip(punct("@"))
        .and(name())
        .and(parser(arguments))
        .map(|((position, name), arguments)| {
            Directive { position, name, arguments }
        }))
    .parse_stream(input)
}

pub fn arguments<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Vec<(String, Value)>, TokenStream<'a>>
{
    optional(
        punct("(")
        .with(many1(name()
            .skip(punct(":"))
            .and(parser(value))))
        .skip(punct(")")))
    .map(|opt| {
        opt.unwrap_or_else(Vec::new)
    })
    .parse_stream(input)
}

pub fn int_value<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Value, TokenStream<'a>>
{
    kind(T::IntValue).and_then(|tok| tok.value.parse())
            .map(Number).map(Value::Int)
    .parse_stream(input)
}

pub fn float_value<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Value, TokenStream<'a>>
{
    kind(T::FloatValue).and_then(|tok| tok.value.parse())
            .map(Value::Float)
    .parse_stream(input)
}

fn unquote_block_string(src: &str) -> Result<String, Error<Token, Token>> {
    debug_assert!(src.starts_with("\"\"\"") && src.ends_with("\"\"\""));
    let indent = src[3..src.len()-3].lines().skip(1)
        .filter_map(|line| {
            let trimmed = line.trim_left().len();
            if trimmed > 0 {
                Some(line.len() - trimmed)
            } else {
                None  // skip whitespace-only lines
            }
        })
        .min().unwrap_or(0);
    let mut result = String::with_capacity(src.len()-6);
    let mut lines = src[3..src.len()-3].lines();
    if let Some(first) = lines.next() {
        let stripped = first.trim();
        if !stripped.is_empty() {
            result.push_str(stripped);
            result.push('\n');
        }
    }
    let mut last_line = 0;
    for line in lines {
        last_line = result.len();
        if line.len() > indent {
            result.push_str(&line[indent..].replace(r#"\""""#, r#"""""#));
        }
        result.push('\n');
    }
    if result[last_line..].trim().is_empty() {
        result.truncate(last_line);
    }

    Ok(result)
}

fn unquote_string(s: &str) -> Result<String, Error<Token, Token>> {
    let mut res = String::with_capacity(s.len());
    debug_assert!(s.starts_with('"') && s.ends_with('"'));
    let mut chars = s[1..s.len()-1].chars();
    let mut temp_code_point = String::with_capacity(4);
    while let Some(c) = chars.next() {
        match c {
            '\\' => {
                match chars.next().expect("slash cant be at the end") {
                    c@'"' | c@'\\' | c@'/' => res.push(c),
                    'b' => res.push('\u{0010}'),
                    'f' => res.push('\u{000C}'),
                    'n' => res.push('\n'),
                    'r' => res.push('\r'),
                    't' => res.push('\t'),
                    'u' => {
                        temp_code_point.clear();
                        for _ in 0..4 {
                            match chars.next() {
                                Some(inner_c) => temp_code_point.push(inner_c),
                                None => return Err(Error::unexpected_message(
                                    format_args!("\\u must have 4 characters after it, only found '{}'", temp_code_point)
                                )),
                            }
                        }

                        // convert our hex string into a u32, then convert that into a char
                        match u32::from_str_radix(&temp_code_point, 16).map(std::char::from_u32) {
                            Ok(Some(unicode_char)) => res.push(unicode_char),
                            _ => {
                                return Err(Error::unexpected_message(
                                    format_args!("{} is not a valid unicode code point", temp_code_point)))
                            }
                        }
                    },
                    c => {
                        return Err(Error::unexpected_message(
                            format_args!("bad escaped char {:?}", c)));
                    }
                }
            }
            c => res.push(c),
        }
    }

    Ok(res)
}

pub fn string<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<String, TokenStream<'a>>
{
    choice((
        kind(T::StringValue).and_then(|tok| unquote_string(tok.value)),
        kind(T::BlockString).and_then(|tok| unquote_block_string(tok.value)),
    )).parse_stream(input)
}

pub fn string_value<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Value, TokenStream<'a>>
{
    kind(T::StringValue).and_then(|tok| unquote_string(tok.value))
        .map(Value::String)
    .parse_stream(input)
}

pub fn block_string_value<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Value, TokenStream<'a>>
{
    kind(T::BlockString).and_then(|tok| unquote_block_string(tok.value))
        .map(Value::String)
    .parse_stream(input)
}

pub fn plain_value<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Value, TokenStream<'a>>
{
    ident("true").map(|_| Value::Boolean(true))
    .or(ident("false").map(|_| Value::Boolean(false)))
    .or(ident("null").map(|_| Value::Null))
    .or(name().map(Value::Enum))
    .or(parser(int_value))
    .or(parser(float_value))
    .or(parser(string_value))
    .or(parser(block_string_value))
    .parse_stream(input)
}

pub fn value<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Value, TokenStream<'a>>
{
    parser(plain_value)
    .or(punct("$").with(name()).map(Value::Variable))
    .or(punct("[").with(many(parser(value))).skip(punct("]"))
        .map(Value::List))
    .or(punct("{")
        .with(many(name().skip(punct(":")).and(parser(value))))
        .skip(punct("}"))
        .map(Value::Object))
    .parse_stream(input)
}

pub fn default_value<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Value, TokenStream<'a>>
{
    parser(plain_value)
    .or(punct("[").with(many(parser(default_value))).skip(punct("]"))
        .map(Value::List))
    .or(punct("{")
        .with(many(name().skip(punct(":")).and(parser(default_value))))
        .skip(punct("}"))
        .map(Value::Object))
    .parse_stream(input)
}

pub fn parse_type<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Type, TokenStream<'a>>
{
    name().map(Type::NamedType)
    .or(punct("[")
        .with(parser(parse_type))
        .skip(punct("]"))
        .map(Box::new)
        .map(Type::ListType))
    .and(optional(punct("!")).map(|v| v.is_some()))
    .map(|(typ, strict)|
        if strict {
            Type::NonNullType(Box::new(typ))
        } else {
            typ
        }
    )
    .parse_stream(input)
}

#[cfg(test)]
mod tests {
    use super::Number;
    use super::unquote_string;

    #[test]
    fn number_from_i32_and_to_i64_conversion() {
        assert_eq!(Number::from(1).as_i64(), Some(1));
        assert_eq!(Number::from(584).as_i64(), Some(584));
        assert_eq!(Number::from(i32::min_value()).as_i64(), Some(i32::min_value() as i64));
        assert_eq!(Number::from(i32::max_value()).as_i64(), Some(i32::max_value() as i64));
    }

    #[test]
    fn unquote_unicode_string() {
        // basic tests
        assert_eq!(unquote_string(r#""\u0009""#).expect(""), "\u{0009}");
        assert_eq!(unquote_string(r#""\u000A""#).expect(""), "\u{000A}");
        assert_eq!(unquote_string(r#""\u000D""#).expect(""), "\u{000D}");
        assert_eq!(unquote_string(r#""\u0020""#).expect(""), "\u{0020}");
        assert_eq!(unquote_string(r#""\uFFFF""#).expect(""), "\u{FFFF}");

        // a more complex string
        assert_eq!(unquote_string(r#""\u0009 hello \u000A there""#).expect(""), "\u{0009} hello \u{000A} there");
    }
}
