use tokenizer::TokenStream;

use combine::{parser, ParseResult, Parser};
use combine::combinator::{many, many1, eof, optional};

use query_error::{QueryParseError};
use tokenizer::Kind as T;
use helpers::{punct, ident, kind, name};
use query::*;

pub fn empty_selection() -> SelectionSet {
    SelectionSet { items: Vec::new() }
}

pub fn directives<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Vec<Directive>, TokenStream<'a>>
{
    many(punct("@")
        .with(name())
        .and(parser(arguments))
        .map(|(name, arguments)| Directive { name, arguments }))
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
    name()
    .and(optional(punct(":").with(name())))
    .and(parser(arguments))
    .and(parser(directives))
    .and(optional(parser(selection_set)))
    .map(|((((name_or_alias, opt_name), arguments), directives), sel)| {
        let (name, alias) = match opt_name {
            Some(name) => (name, Some(name_or_alias)),
            None => (name_or_alias, None),
        };
        Field {
            name, alias, arguments, directives,
            selection_set: sel.unwrap_or_else(empty_selection),
        }
    })
    .parse_stream(input)
}

pub fn selection<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Selection, TokenStream<'a>>
{
    parser(field).map(Selection::Field)
    .or(punct("...").with(
        optional(ident("on").with(name()).map(TypeCondition::On))
            .and(parser(directives))
            .and(parser(selection_set))
            .map(|((type_condition, directives), selection_set)| {
                InlineFragment { type_condition, selection_set, directives }
            })
            .map(Selection::InlineFragment)
        .or(name()
            .and(parser(directives))
            .map(|(fragment_name, directives)| {
                FragmentSpread { fragment_name, directives }
            })
            .map(Selection::FragmentSpread))
    ))
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

pub fn int_value<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Value, TokenStream<'a>>
{
    kind(T::IntValue).and_then(|tok| tok.value.parse())
            .map(Number).map(Value::Int)
    .parse_stream(input)
}

pub fn value<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Value, TokenStream<'a>>
{
    name().map(Value::EnumValue)
    .or(parser(int_value))
    .or(punct("$").with(name()).map(Value::Variable))
    .or(punct("[").with(many(parser(value))).skip(punct("]"))
        .map(|lst| Value::ListValue(lst)))
    // TODO(tailhook) more values
    .parse_stream(input)
}

pub fn default_value<'a>(input: &mut TokenStream<'a>)
    -> ParseResult<Value, TokenStream<'a>>
{
    name().map(Value::EnumValue)
    .or(parser(int_value))
    .or(punct("[").with(many(parser(default_value))).skip(punct("]"))
        .map(|lst| Value::ListValue(lst)))
    // TODO(tailhook) more values
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
                .and(optional(
                    punct("=")
                    .with(parser(default_value))))
                .map(|((name, var_type), default_value)| VariableDefinition {
                    name, var_type, default_value,
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

    #[test]
    #[should_panic(expected="number too large")]
    fn large_integer() {
        ast("{ a(x: 10000000000000000000000000000 }");
    }
}
