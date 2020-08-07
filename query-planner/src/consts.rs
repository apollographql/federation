use crate::helpers::{pos, span};
use graphql_parser::{schema, schema::Type};
use graphql_parser::query::refs::{FieldRef, SelectionSetRef};

lazy_static! {
    pub static ref TYPENAME_QUERY_FIELD: FieldRef<'static> = FieldRef {
        position: pos(),
        alias: None,
        name: "__typename",
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
        name: "__typename",
        arguments: vec![],
        field_type: Type::NonNullType(Box::new(Type::NamedType("String"))),
        directives: vec![]
    };
}
