use graphql_parser::schema;
use graphql_parser::schema::TypeDefinition;

pub struct FederationMetadata {}

impl FederationMetadata {
    pub fn is_value_type(&self) -> bool {
        unimplemented!()
    }
}

pub fn get_federation_field_medatadata(field: &schema::Field) -> Option<FederationMetadata> {
    unimplemented!()
}

pub fn get_federation_type_medatadata(field: &TypeDefinition) -> Option<FederationMetadata> {
    unimplemented!()
}
