use std::collections::HashSet;

pub use query::{Directive, VariableType, Value};


pub type NamedType = String;
pub type Name = String;

#[derive(Debug, Clone, PartialEq)]
pub struct Document {
    pub definitions: Vec<Definition>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Definition {
    SchemaDefinition(SchemaDefinition),
    TypeDefinition(TypeDefinition),
    TypeExtension(TypeExtension),
    DirectiveDefinition(DirectiveDefinition),
}

#[derive(Debug, Clone, PartialEq)]
pub struct SchemaDefinition {
    directives: Vec<Directive>,
    query: Option<NamedType>,
    mutation: Option<NamedType>,
    subscription: Option<NamedType>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TypeDefinition {
    Scalar(ScalarType),
    Object(ObjectType),
    Interface(InterfaceType),
    Union(UnionType),
    Enum(EnumType),
    InputObject(InputObjectType),
}

#[derive(Debug, Clone, PartialEq)]
pub enum TypeExtension {
    Scalar(ScalarTypeExtension),
    Object(ObjectTypeExtension),
    Interface(InterfaceTypeExtension),
    Union(UnionTypeExtension),
    Enum(EnumTypeExtension),
    InputObject(InputObjectTypeExtension),
}

#[derive(Debug, Clone, PartialEq)]
pub struct ScalarType {
    description: Option<String>,
    name: Name,
    directives: Vec<Directive>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ScalarTypeExtension {
    name: Name,
    directives: Vec<Directive>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ObjectType {
    description: Option<String>,
    name: Name,
    implements_interfaces: Vec<NamedType>,
    directives: Vec<Directive>,
    fields: Vec<Field>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ObjectTypeExtension {
    name: Name,
    implements_interfaces: Vec<NamedType>,
    directives: Vec<Directive>,
    fields: Vec<Field>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Field {
    description: Option<String>,
    name: Name,
    arguments: Vec<InputValue>,
    field_type: VariableType,  // VariableType
    directives: Vec<Directive>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct InputValue {
    description: Option<String>,
    name: Name,
    value_type: VariableType,
    default_value: Value,
    directives: Vec<Directive>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct InterfaceType {
    description: Option<String>,
    name: Name,
    directives: Vec<Directive>,
    fields: Vec<Field>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct InterfaceTypeExtension {
    name: Name,
    directives: Vec<Directive>,
    fields: Vec<Field>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct UnionType {
    description: Option<String>,
    name: Name,
    directives: Vec<Directive>,
    types: Vec<NamedType>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct UnionTypeExtension {
    name: Name,
    directives: Vec<Directive>,
    types: Vec<NamedType>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct EnumType {
    description: Option<String>,
    name: Name,
    directives: Vec<Directive>,
    values: Vec<EnumValue>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct EnumValue {
    description: Option<String>,
    name: Name,
    directives: Vec<Directive>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct EnumTypeExtension {
    name: Name,
    directives: Vec<Directive>,
    values: Vec<EnumValue>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct InputObjectType {
    description: Option<String>,
    name: Name,
    directives: Vec<Directive>,
    fields: Vec<InputValue>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct InputObjectTypeExtension {
    name: Name,
    directives: Vec<Directive>,
    fields: Vec<InputValue>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum DirectiveLocation {
    // executable
    QUERY,
    MUTATION,
    SUBSCRIPTION,
    FIELD,
    FRAGMENT_DEFINITION,
    FRAGMENT_SPREAD,
    INLINE_FRAGMENT,
    // type_system
    SCHEMA,
    SCALAR,
    OBJECT,
    FIELD_DEFINITION,
    ARGUMENT_DEFINITION,
    INTERFACE,
    UNION,
    ENUM,
    ENUM_VALUE,
    INPUT_OBJECT,
    INPUT_FIELD_DEFINITION,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DirectiveDefinition {
    description: Option<String>,
    name: Name,
    arguments: Vec<InputValue>,
    // TODO(tailhook) probably convert to a bitset
    locations: HashSet<DirectiveLocation>,
}
