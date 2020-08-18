use crate::helpers::{pos, span};
use graphql_parser::query::refs::{FieldRef, SelectionSetRef};
use graphql_parser::{schema, schema::Type};

lazy_static! {
    pub static ref TYPENAME_QUERY_FIELD: FieldRef<'static> = FieldRef {
        position: pos(),
        alias: None,
        name: TYPENAME_FIELD_NAME,
        arguments: vec![],
        directives: vec![],
        selection_set: SelectionSetRef {
            span: span(),
            items: vec![],
        },
    };
    pub static ref TYPENAME_SCHEMA_FIELD: schema::Field<'static> = schema::Field {
        position: pos(),
        description: None,
        name: TYPENAME_FIELD_NAME,
        arguments: vec![],
        field_type: Type::NonNullType(Box::new(Type::NamedType("String"))),
        directives: vec![]
    };
}

pub static TYPENAME_FIELD_NAME: &str = "__typename";
