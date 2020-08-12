use graphql_parser::query::refs::SelectionSetRef;
use graphql_parser::schema::{Field, ObjectType};

pub struct FederationMetadata {}

impl FederationMetadata {
    pub fn is_value_type(&self) -> bool {
        unimplemented!()
    }

    pub fn service_name(&self) -> Option<String> {
        unimplemented!()
    }

    pub fn belongs_to_value_type(&self) -> bool {
        unimplemented!()
    }

    pub fn key(&self, service_name: &str) -> Option<Vec<DirectiveSelection>> {
        unimplemented!()
    }

    pub fn requires(&self) -> Option<DirectiveSelection> {
        unimplemented!()
    }

    pub fn provides(&self) -> Option<DirectiveSelection> {
        unimplemented!()
    }
}

pub struct DirectiveSelection {}

impl DirectiveSelection {
    pub fn selection_set<'q>(&self) -> SelectionSetRef<'q> {
        unimplemented!()
    }
}

pub enum SchemaRef<'q> {
    FieldDef(&'q Field<'q>),
    ObjType(&'q ObjectType<'q>),
}

macro_rules! impl_from {
    // This implements `From` for all inner types of SchemaRef,
    // so that get_federation_metadata can be called directly with any of those types.
    ($typ:ident < $lt:lifetime >, $enum_name:ident) => {
        impl<$lt> From<&$lt$typ<$lt>> for SchemaRef<$lt> {
            fn from(r: &$lt$typ<$lt>) -> Self {
                SchemaRef::$enum_name(r)
            }
        }
    }
}

impl_from!(Field<'q>, FieldDef);
impl_from!(ObjectType<'q>, ObjType);

pub fn get_federation_metadata<'q, T: Into<SchemaRef<'q>>>(
    handle: T,
) -> Option<FederationMetadata> {
    match handle.into() {
        SchemaRef::FieldDef(field_def) => unimplemented!(),
        SchemaRef::ObjType(object_type) => unimplemented!(),
    }
}
