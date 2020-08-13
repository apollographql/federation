use graphql_parser::query::refs::SelectionSetRef;
use graphql_parser::schema::{Document, Field, ObjectType, Txt};
use graphql_parser::Pos;
use std::collections::HashMap;

#[derive(Debug, PartialEq)]
struct FederationTypeMetadata<'q> {
    type_is_value_type: HashMap<Pos, bool>,
    type_keys: HashMap<Pos, HashMap<Txt<'q>, Vec<SelectionSetRef<'q>>>>,
    type_service_name: HashMap<Pos, Txt<'q>>,
}

#[derive(Debug, PartialEq)]
struct FederationFieldMetadata<'q> {
    field_service_name: HashMap<Pos, Txt<'q>>,
    field_requires: HashMap<Pos, SelectionSetRef<'q>>,
    field_provides: HashMap<Pos, SelectionSetRef<'q>>,
}

#[derive(Debug, PartialEq)]
pub struct Federation<'q> {
    types: FederationTypeMetadata<'q>,
    fields: FederationFieldMetadata<'q>,
}

impl<'q> Federation<'q> {
    pub fn new(schema: &'q Document<'q>) -> Federation<'q> {
        unimplemented!()
    }

    pub fn service_name_for_field(
        &self,
        field_def: &'q Field<'q>,
        parent_type: Option<&'q ObjectType<'q>>,
    ) -> Option<String> {
        self.fields
            .field_service_name
            .get(&field_def.position)
            .map(|s| String::from(*s))
            .or_else(|| parent_type.and_then(|pt| self.service_name_for_type(pt)))
    }

    pub fn requires(&self, field_def: &'q Field<'q>) -> Option<SelectionSetRef<'q>> {
        // we can clone these, they're tiny.
        self.fields.field_requires.get(&field_def.position).cloned()
    }

    pub fn provides(&self, field_def: &'q Field<'q>) -> Option<SelectionSetRef<'q>> {
        self.fields.field_provides.get(&field_def.position).cloned()
    }

    pub fn service_name_for_type(&self, object_type: &'q ObjectType<'q>) -> Option<String> {
        self.types
            .type_service_name
            .get(&object_type.position)
            .map(|s| String::from(*s))
    }

    pub fn key(
        &self,
        object_type: &'q ObjectType<'q>,
        service_name: &str,
    ) -> Option<Vec<SelectionSetRef<'q>>> {
        self.types
            .type_keys
            .get(&object_type.position)
            .and_then(|keys_map| keys_map.get(service_name).map(|v| v.clone()))
    }

    pub fn is_value_type(&self, object_type: &'q ObjectType<'q>) -> bool {
        self.types.type_is_value_type[&object_type.position]
    }
}
