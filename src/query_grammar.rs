use tokenizer::TokenStream;

use combine::{parser, ParseResult, Parser};
use combine::easy::Error;
use combine::error::StreamError;
use combine::combinator::{many, many1, eof, optional, position};

use query_error::{QueryParseError};
use tokenizer::{Kind as T, Token};
use helpers::{punct, ident, kind, name};
use query::*;

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

pub fn variable_type<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<VariableType, TokenStream<'a>>
{
    name().map(VariableType::NamedType)
    .or(punct("[")
        .with(parser(variable_type))
        .skip(punct("]"))
        .map(Box::new)
        .map(VariableType::ListType))
    .and(optional(punct("!")).map(|v| v.is_some()))
    .map(|(typ, strict)| match strict {
        true => VariableType::NonNullType(Box::new(typ)),
        false => typ,
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

fn unquote_string(s: &str) -> Result<String, Error<Token, Token>> {
    let mut res = String::with_capacity(s.len());
    debug_assert!(s.starts_with("\"") && s.ends_with("\""));
    let mut chars = s[1..s.len()-1].chars();
    while let Some(c) = chars.next() {
        match c {
            '\\' => {
                match chars.next().expect("slash cant be and the end") {
                    c@'"' | c@'\\' | c@'/' => res.push(c),
                    'b' => res.push('\u{0010}'),
                    'f' => res.push('\u{000C}'),
                    'n' => res.push('\n'),
                    'r' => res.push('\r'),
                    't' => res.push('\t'),
                    'u' => {
                        unimplemented!();
                    }
                    c => {
                        return Err(Error::unexpected_message(
                            format_args!("bad escaped char {:?}", c)));
                    }
                }
            }
            c => res.push(c),
        }
    }
    return Ok(res);
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
        if stripped.len() > 0 {
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
    if result[last_line..].trim().len() == 0 {
        result.truncate(last_line);
    }
    return Ok(result);
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
        .map(|lst| Value::List(lst)))
    .or(punct("{")
        .with(many(name().skip(punct(":")).and(parser(value))))
        .skip(punct("}"))
        .map(|lst| Value::Object(lst)))
    .parse_stream(input)
}

pub fn default_value<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Value, TokenStream<'a>>
{
    parser(plain_value)
    .or(punct("[").with(many(parser(default_value))).skip(punct("]"))
        .map(|lst| Value::List(lst)))
    .or(punct("{")
        .with(many(name().skip(punct(":")).and(parser(default_value))))
        .skip(punct("}"))
        .map(|map| Value::Object(map)))
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

pub fn operation_common<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<
        (Option<String>, Vec<VariableDefinition>, Vec<Directive>,
         SelectionSet),
        TokenStream<'a>>
{
    optional(name())
    .and(optional(
        punct("(")
        .with(many1(
            (
                position(),
                punct("$").with(name()).skip(punct(":")),
                parser(variable_type),
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
pub fn parse_query(s: &str) -> Result<Document, QueryParseError> {
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
    use query::*;
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
