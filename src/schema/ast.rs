use std::str::FromStr;

pub use common::{Directive, Type, Name, Value};
use position::Pos;

pub type NamedType = String;


#[derive(Debug, Clone, Default, PartialEq)]
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

#[derive(Debug, Clone, Default, PartialEq)]
pub struct SchemaDefinition {
    pub position: Pos,
    pub directives: Vec<Directive>,
    pub query: Option<NamedType>,
    pub mutation: Option<NamedType>,
    pub subscription: Option<NamedType>,
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
    pub position: Pos,
    pub description: Option<String>,
    pub name: Name,
    pub directives: Vec<Directive>,
}

impl ScalarType {
    pub fn new(name: Name) -> Self {
        Self {
            position: Pos::default(),
            description: None,
            name,
            directives: vec![],
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ScalarTypeExtension {
    pub position: Pos,
    pub name: Name,
    pub directives: Vec<Directive>,
}

impl ScalarTypeExtension {
    pub fn new(name: Name) -> Self {
        Self {
            position: Pos::default(),
            name,
            directives: vec![],
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ObjectType {
    pub position: Pos,
    pub description: Option<String>,
    pub name: Name,
    pub implements_interfaces: Vec<NamedType>,
    pub directives: Vec<Directive>,
    pub fields: Vec<Field>,
}

impl ObjectType {
    pub fn new(name: Name) -> Self {
        Self {
            position: Pos::default(),
            description: None,
            name,
            implements_interfaces: vec![],
            directives: vec![],
            fields: vec![],
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ObjectTypeExtension {
    pub position: Pos,
    pub name: Name,
    pub implements_interfaces: Vec<NamedType>,
    pub directives: Vec<Directive>,
    pub fields: Vec<Field>,
}

impl ObjectTypeExtension {
    pub fn new(name: Name) -> Self {
        Self {
            position: Pos::default(),
            name,
            implements_interfaces: vec![],
            directives: vec![],
            fields: vec![],
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Field {
    pub position: Pos,
    pub description: Option<String>,
    pub name: Name,
    pub arguments: Vec<InputValue>,
    pub field_type: Type,
    pub directives: Vec<Directive>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct InputValue {
    pub position: Pos,
    pub description: Option<String>,
    pub name: Name,
    pub value_type: Type,
    pub default_value: Option<Value>,
    pub directives: Vec<Directive>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct InterfaceType {
    pub position: Pos,
    pub description: Option<String>,
    pub name: Name,
    pub directives: Vec<Directive>,
    pub fields: Vec<Field>,
}

impl InterfaceType {
    pub fn new(name: Name) -> Self {
        Self {
            position: Pos::default(),
            description: None,
            name,
            directives: vec![],
            fields: vec![],
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct InterfaceTypeExtension {
    pub position: Pos,
    pub name: Name,
    pub directives: Vec<Directive>,
    pub fields: Vec<Field>,
}

impl InterfaceTypeExtension {
    pub fn new(name: Name) -> Self {
        Self {
            position: Pos::default(),
            name,
            directives: vec![],
            fields: vec![],
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct UnionType {
    pub position: Pos,
    pub description: Option<String>,
    pub name: Name,
    pub directives: Vec<Directive>,
    pub types: Vec<NamedType>,
}

impl UnionType {
    pub fn new(name: Name) -> Self {
        Self {
            position: Pos::default(),
            description: None,
            name,
            directives: vec![],
            types: vec![],
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct UnionTypeExtension {
    pub position: Pos,
    pub name: Name,
    pub directives: Vec<Directive>,
    pub types: Vec<NamedType>,
}

impl UnionTypeExtension {
    pub fn new(name: Name) -> Self {
        Self {
            position: Pos::default(),
            name,
            directives: vec![],
            types: vec![],
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct EnumType {
    pub position: Pos,
    pub description: Option<String>,
    pub name: Name,
    pub directives: Vec<Directive>,
    pub values: Vec<EnumValue>,
}

impl EnumType {
    pub fn new(name: Name) -> Self {
        Self {
            position: Pos::default(),
            description: None,
            name,
            directives: vec![],
            values: vec![],
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct EnumValue {
    pub position: Pos,
    pub description: Option<String>,
    pub name: Name,
    pub directives: Vec<Directive>,
}

impl EnumValue {
    pub fn new(name: Name) -> Self {
        Self {
            position: Pos::default(),
            description: None,
            name,
            directives: vec![],
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct EnumTypeExtension {
    pub position: Pos,
    pub name: Name,
    pub directives: Vec<Directive>,
    pub values: Vec<EnumValue>,
}

impl EnumTypeExtension {
    pub fn new(name: Name) -> Self {
        Self {
            position: Pos::default(),
            name,
            directives: vec![],
            values: vec![],
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct InputObjectType {
    pub position: Pos,
    pub description: Option<String>,
    pub name: Name,
    pub directives: Vec<Directive>,
    pub fields: Vec<InputValue>,
}

impl InputObjectType {
    pub fn new(name: Name) -> Self {
        Self {
            position: Pos::default(),
            description: None,
            name,
            directives: vec![],
            fields: vec![],
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct InputObjectTypeExtension {
    pub position: Pos,
    pub name: Name,
    pub directives: Vec<Directive>,
    pub fields: Vec<InputValue>,
}

impl InputObjectTypeExtension {
    pub fn new(name: Name) -> Self {
        Self {
            position: Pos::default(),
            name,
            directives: vec![],
            fields: vec![],
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum DirectiveLocation {
    // executable
    Query,
    Mutation,
    Subscription,
    Field,
    FragmentDefinition,
    FragmentSpread,
    InlineFragment,

    // type_system
    Schema,
    Scalar,
    Object,
    FieldDefinition,
    ArgumentDefinition,
    Interface,
    Union,
    Enum,
    EnumValue,
    InputObject,
    InputFieldDefinition,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DirectiveDefinition {
    pub position: Pos,
    pub description: Option<String>,
    pub name: Name,
    pub arguments: Vec<InputValue>,
    pub locations: Vec<DirectiveLocation>,
}

impl DirectiveDefinition {
    pub fn new(name: Name) -> Self {
        Self {
            position: Pos::default(),
            description: None,
            name,
            arguments: vec![],
            locations: vec![],
        }
    }
}

impl DirectiveLocation {
    /// Returns GraphQL syntax compatible name of the directive
    pub fn as_str(&self) -> &'static str {
        use self::DirectiveLocation::*;
        match *self {
            Query => "QUERY",
            Mutation => "MUTATION",
            Subscription => "SUBSCRIPTION",
            Field => "FIELD",
            FragmentDefinition => "FRAGMENT_DEFINITION",
            FragmentSpread => "FRAGMENT_SPREAD",
            InlineFragment => "INLINE_FRAGMENT",
            Schema => "SCHEMA",
            Scalar => "SCALAR",
            Object => "OBJECT",
            FieldDefinition => "FIELD_DEFINITION",
            ArgumentDefinition => "ARGUMENT_DEFINITION",
            Interface => "INTERFACE",
            Union => "UNION",
            Enum => "ENUM",
            EnumValue => "ENUM_VALUE",
            InputObject => "INPUT_OBJECT",
            InputFieldDefinition => "INPUT_FIELD_DEFINITION",
        }
    }

    /// Returns `true` if this location is for queries (execution)
    pub fn is_query(&self) -> bool {
        use self::DirectiveLocation::*;
        match *self {
            Query
            | Mutation
            | Subscription
            | Field
            | FragmentDefinition
            | FragmentSpread
            | InlineFragment
                => true,

            Schema
            | Scalar
            | Object
            | FieldDefinition
            | ArgumentDefinition
            | Interface
            | Union
            | Enum
            | EnumValue
            | InputObject
            | InputFieldDefinition
                => false,
        }
    }

    /// Returns `true` if this location is for schema
    pub fn is_schema(&self) -> bool {
        !self.is_query()
    }
}

#[derive(Debug, Fail)]
#[fail(display = "invalid directive location")]
pub struct InvalidDirectiveLocation;


impl FromStr for DirectiveLocation {
    type Err = InvalidDirectiveLocation;
    fn from_str(s: &str) -> Result<DirectiveLocation, InvalidDirectiveLocation>
    {
        use self::DirectiveLocation::*;
        let val = match s {
            "QUERY" => Query,
            "MUTATION" => Mutation,
            "SUBSCRIPTION" => Subscription,
            "FIELD" => Field,
            "FRAGMENT_DEFINITION" => FragmentDefinition,
            "FRAGMENT_SPREAD" => FragmentSpread,
            "INLINE_FRAGMENT" => InlineFragment,
            "SCHEMA" => Schema,
            "SCALAR" => Scalar,
            "OBJECT" => Object,
            "FIELD_DEFINITION" => FieldDefinition,
            "ARGUMENT_DEFINITION" => ArgumentDefinition,
            "INTERFACE" => Interface,
            "UNION" => Union,
            "ENUM" => Enum,
            "ENUM_VALUE" => EnumValue,
            "INPUT_OBJECT" => InputObject,
            "INPUT_FIELD_DEFINITION" => InputFieldDefinition,
            _ => return Err(InvalidDirectiveLocation),
        };

        Ok(val)
    }
}
