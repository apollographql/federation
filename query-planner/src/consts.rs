use crate::helpers::{pos, span};
use graphql_parser::query::refs::{FieldRef, SelectionSetRef};
use graphql_parser::query::{Directive, Txt, Value};
use graphql_parser::{schema, schema::Type};

lazy_static! {
    static ref TYPENAME_QUERY_FIELD: FieldRef<'static> = FieldRef {
        position: pos(),
        alias: None,
        name: TYPENAME_FIELD_NAME,
        arguments: &EMPTY_ARGS,
        directives: &EMPTY_DIRECTIVES,
        selection_set: SelectionSetRef {
            span: span(),
            items: vec![],
        },
    };
    static ref TYPENAME_SCHEMA_FIELD: schema::Field<'static> = schema::Field {
        position: pos(),
        description: None,
        name: TYPENAME_FIELD_NAME,
        arguments: vec![],
        field_type: Type::NonNullType(Box::new(Type::NamedType("String"))),
        directives: vec![]
    };
}

pub static TYPENAME_FIELD_NAME: &str = "__typename";
pub static INTROSPECTION_SCHEMA_FIELD_NAME: &str = "__schema";
pub static QUERY_TYPE_NAME: &str = "Query";
pub static MUTATION_TYPE_NAME: &str = "Mutation";
pub static EMPTY_ARGS: Vec<(Txt<'static>, Value<'static>)> = vec![];
pub static EMPTY_DIRECTIVES: Vec<Directive<'static>> = vec![];

pub fn typename_field_def<'a>() -> &'a schema::Field<'a> {
    &*TYPENAME_SCHEMA_FIELD
}

pub fn typename_field_node<'a>() -> FieldRef<'a> {
    (*TYPENAME_QUERY_FIELD).clone()
}
