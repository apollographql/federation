use std::collections::BTreeMap;

use combine::easy::Error;
use combine::error::StreamError;
use combine::parser::choice::{choice, optional};
use combine::parser::item::position;
use combine::parser::repeat::{many, many1};
use combine::{parser, ParseResult, Parser};

use crate::helpers::{ident, kind, name, punct};
use crate::position::Pos;
use crate::tokenizer::{Kind as T, Token, TokenStream};
use ordered_float::NotNan;

#[derive(Debug, Clone, PartialEq, Derivative)]
#[derivative(Hash)]
pub struct Directive<'a> {
    #[derivative(Hash = "ignore")]
    pub position: Pos,
    pub name: &'a str,
    pub arguments: Vec<(Txt<'a>, Value<'a>)>,
}

pub type Txt<'a> = &'a str;

#[derive(Debug, Clone, PartialEq, Hash)]
pub enum Value<'a> {
    Variable(Txt<'a>),
    Int(i64),
    Float(NotNan<f64>),
    String(String),
    Boolean(bool),
    Null,
    Enum(Txt<'a>),
    List(Vec<Value<'a>>),
    Object(BTreeMap<Txt<'a>, Value<'a>>),
}

#[derive(Debug, Clone, PartialEq, Hash)]
pub enum Type<'a> {
    NamedType(Txt<'a>),
    ListType(Box<Type<'a>>),
    NonNullType(Box<Type<'a>>),
}

pub fn directives<'a>(
    input: &mut TokenStream<'a>,
) -> ParseResult<Vec<Directive<'a>>, TokenStream<'a>> {
    many(
        position()
            .skip(punct("@"))
            .and(name::<'a>())
            .and(parser(arguments))
            .map(|((position, name), arguments)| Directive {
                position,
                name,
                arguments,
            }),
    )
    .parse_stream(input)
}

pub fn arguments<'a>(
    input: &mut TokenStream<'a>,
) -> ParseResult<Vec<(Txt<'a>, Value<'a>)>, TokenStream<'a>> {
    optional(
        punct("(")
            .with(many1(name::<'a>().skip(punct(":")).and(parser(value))))
            .skip(punct(")")),
    )
    .map(|opt| opt.unwrap_or_else(Vec::new))
    .parse_stream(input)
}

pub fn int_value<'a>(input: &mut TokenStream<'a>) -> ParseResult<Value<'a>, TokenStream<'a>> {
    kind(T::IntValue)
        .and_then(|tok| tok.value.parse())
        .map(Value::Int)
        .parse_stream(input)
}

pub fn float_value<'a>(input: &mut TokenStream<'a>) -> ParseResult<Value<'a>, TokenStream<'a>> {
    kind(T::FloatValue)
        .and_then(|tok| tok.value.parse::<NotNan<f64>>())
        .map(Value::Float)
        .parse_stream(input)
}

fn unquote_block_string(src: &str) -> Result<String, Error<Token, Token>> {
    debug_assert!(src.starts_with("\"\"\"") && src.ends_with("\"\"\""));
    let indent = src[3..src.len() - 3]
        .lines()
        .skip(1)
        .filter_map(|line| {
            let trimmed = line.trim_start().len();
            if trimmed > 0 {
                Some(line.len() - trimmed)
            } else {
                None // skip whitespace-only lines
            }
        })
        .min()
        .unwrap_or(0);
    let mut result = String::with_capacity(src.len() - 6);
    let mut lines = src[3..src.len() - 3].lines();
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
    let mut chars = s[1..s.len() - 1].chars();
    let mut temp_code_point = String::with_capacity(4);
    while let Some(c) = chars.next() {
        match c {
            '\\' => {
                match chars.next().expect("slash cant be at the end") {
                    c @ '"' | c @ '\\' | c @ '/' => res.push(c),
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
                                None => {
                                    return Err(Error::unexpected_message(format_args!(
                                        "\\u must have 4 characters after it, only found '{}'",
                                        temp_code_point
                                    )))
                                }
                            }
                        }

                        // convert our hex string into a u32, then convert that into a char
                        match u32::from_str_radix(&temp_code_point, 16).map(std::char::from_u32) {
                            Ok(Some(unicode_char)) => res.push(unicode_char),
                            _ => {
                                return Err(Error::unexpected_message(format_args!(
                                    "{} is not a valid unicode code point",
                                    temp_code_point
                                )))
                            }
                        }
                    }
                    c => {
                        return Err(Error::unexpected_message(format_args!(
                            "bad escaped char {:?}",
                            c
                        )));
                    }
                }
            }
            c => res.push(c),
        }
    }

    Ok(res)
}

pub fn string<'a>(input: &mut TokenStream<'a>) -> ParseResult<String, TokenStream<'a>> {
    choice((
        kind(T::StringValue).and_then(|tok| unquote_string(tok.value)),
        kind(T::BlockString).and_then(|tok| unquote_block_string(tok.value)),
    ))
    .parse_stream(input)
}

pub fn string_value<'a>(input: &mut TokenStream<'a>) -> ParseResult<Value<'a>, TokenStream<'a>> {
    kind(T::StringValue)
        .and_then(|tok| unquote_string(tok.value))
        .map(Value::String)
        .parse_stream(input)
}

pub fn block_string_value<'a>(
    input: &mut TokenStream<'a>,
) -> ParseResult<Value<'a>, TokenStream<'a>> {
    kind(T::BlockString)
        .and_then(|tok| unquote_block_string(tok.value))
        .map(Value::String)
        .parse_stream(input)
}

pub fn plain_value<'a>(input: &mut TokenStream<'a>) -> ParseResult<Value<'a>, TokenStream<'a>> {
    ident("true")
        .map(|_| Value::Boolean(true))
        .or(ident("false").map(|_| Value::Boolean(false)))
        .or(ident("null").map(|_| Value::Null))
        .or(name::<'a>().map(Value::Enum))
        .or(parser(int_value))
        .or(parser(float_value))
        .or(parser(string_value))
        .or(parser(block_string_value))
        .parse_stream(input)
}

pub fn value<'a>(input: &mut TokenStream<'a>) -> ParseResult<Value<'a>, TokenStream<'a>> {
    parser(plain_value)
        .or(punct("$").with(name::<'a>()).map(Value::Variable))
        .or(punct("[")
            .with(many(parser(value)))
            .skip(punct("]"))
            .map(Value::List))
        .or(punct("{")
            .with(many(name::<'a>().skip(punct(":")).and(parser(value))))
            .skip(punct("}"))
            .map(Value::Object))
        .parse_stream(input)
}

pub fn default_value<'a>(input: &mut TokenStream<'a>) -> ParseResult<Value<'a>, TokenStream<'a>> {
    parser(plain_value)
        .or(punct("[")
            .with(many(parser(default_value)))
            .skip(punct("]"))
            .map(Value::List))
        .or(punct("{")
            .with(many(
                name::<'a>().skip(punct(":")).and(parser(default_value)),
            ))
            .skip(punct("}"))
            .map(Value::Object))
        .parse_stream(input)
}

pub fn parse_type<'a>(input: &mut TokenStream<'a>) -> ParseResult<Type<'a>, TokenStream<'a>> {
    name::<'a>()
        .map(Type::NamedType)
        .or(punct("[")
            .with(parser(parse_type))
            .skip(punct("]"))
            .map(Box::new)
            .map(Type::ListType))
        .and(optional(punct("!")).map(|v| v.is_some()))
        .map(|(typ, strict)| {
            if strict {
                Type::NonNullType(Box::new(typ))
            } else {
                typ
            }
        })
        .parse_stream(input)
}

#[cfg(test)]
mod tests {
    use super::unquote_string;

    #[test]
    fn unquote_unicode_string() {
        // basic tests
        assert_eq!(unquote_string(r#""\u0009""#).expect(""), "\u{0009}");
        assert_eq!(unquote_string(r#""\u000A""#).expect(""), "\u{000A}");
        assert_eq!(unquote_string(r#""\u000D""#).expect(""), "\u{000D}");
        assert_eq!(unquote_string(r#""\u0020""#).expect(""), "\u{0020}");
        assert_eq!(unquote_string(r#""\uFFFF""#).expect(""), "\u{FFFF}");

        // a more complex string
        assert_eq!(
            unquote_string(r#""\u0009 hello \u000A there""#).expect(""),
            "\u{0009} hello \u{000A} there"
        );
    }
}
