use tokenizer::TokenStream;

use combine::{parser, ParseResult, Parser};
use combine::combinator::{many1, eof, optional};

use query_error::{QueryParseError};
use tokenizer::Kind as T;
use helpers::{punct, ident, kind, name};
use query::*;

pub fn field<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Field, TokenStream<'a>>
{
    kind(T::Name)
    .map(|name| {
        Field {
            alias: None,
            name: name.value.to_string(),
            arguments: Vec::new(),
            directives: Vec::new(),
            selection_set: SelectionSet { items: Vec::new() },
        }
    })
    .parse_stream(input)
}

pub fn fragment_spread<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<FragmentSpread, TokenStream<'a>>
{
    unimplemented!();
}

pub fn inline_fragment<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<InlineFragment, TokenStream<'a>>
{
    unimplemented!();
}

pub fn selection<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Selection, TokenStream<'a>>
{
    parser(field).map(Selection::Field)
    //.or(parser(fragment_spread).map(Selection::FragmentSpread))
    //.or(parser(inline_fragment).map(Selection::InlineFragment))
    .parse_stream(input)
}

pub fn selection_set<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<SelectionSet, TokenStream<'a>>
{
    punct("{")
    .with(many1(parser(selection)))
    .skip(punct("}"))
    .map(|items| SelectionSet { items })
    .parse_stream(input)
}

pub fn variable_type<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<VariableType, TokenStream<'a>>
{
    name().map(|x| VariableType::NamedType(x))
    // .or(list...)
    // .or(non_null_type)
    .parse_stream(input)
}

pub fn query<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Query, TokenStream<'a>>
{
    ident("query")
    .with(optional(name()))
    .and(optional(
        punct("(")
        .with(many1(
            punct("$").with(name()).skip(punct(":"))
                .and(parser(variable_type))
                .map(|(name, var_type)| VariableDefinition {
                    name, var_type,
                    // TODO(tailhook)
                    default_value: None,
                })
        ))
        .skip(punct(")"))))
    .and(parser(selection_set))
    .map(|((name, vars), selection_set)| Query {
        name,
        selection_set,
        // TODO(tailhook)
        variable_definitions: vars.unwrap_or_else(Vec::new),
        directives: Vec::new(),
    })
    .parse_stream(input)
}

pub fn mutation<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Mutation, TokenStream<'a>>
{
    unimplemented!();
}

pub fn subscription<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Subscription, TokenStream<'a>>
{
    unimplemented!();
}

pub fn operation_definition<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<OperationDefinition, TokenStream<'a>>
{
    parser(selection_set).map(OperationDefinition::SelectionSet)
    .or(parser(query).map(OperationDefinition::Query))
    //.or(parser(mutation).map(OperationDefinition::Mutation))
    //.or(parser(subscription).map(OperationDefinition::Subscription))
    .parse_stream(input)
}

pub fn fragment_definition<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<FragmentDefinition, TokenStream<'a>>
{
    unimplemented!();
}

pub fn definition<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Definition, TokenStream<'a>>
{
    parser(operation_definition).map(Definition::Operation)
    //.or(parser(fragment_definition).map(Definition::Fragment))
    .parse_stream(input)
}

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
                        items: vec![
                            Selection::Field(Field {
                                alias: None,
                                name: "a".into(),
                                arguments: Vec::new(),
                                directives: Vec::new(),
                                selection_set: SelectionSet {
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
}
