use std::collections::BTreeMap;

type Name = String;


pub struct Document {
    pub definitions: Vec<Definition>,
}

pub enum Definition {
    Operation(OperationDefinition),
    Fragment(FragmentDefinition),
}

pub struct FragmentDefinition {
    pub name: Name,
    pub type_condition: TypeCondition,
    pub directives: Vec<Directive>,
    pub selection_set: Vec<Selection>,
}

pub enum OperationDefinition {
    SelectionSet(Vec<Selection>),
    Query(Query),
    Mutation(Mutation),
    Subscription(Subscription),
}
pub struct Query {
    pub name: Name,
    pub variable_definitions: Vec<VariableDefinition>,
    pub directives: Vec<Directive>,
    pub selection_set: Vec<Selection>,
}
pub struct Mutation {
    pub name: Name,
    pub variable_definitions: Vec<VariableDefinition>,
    pub directives: Vec<Directive>,
    pub selection_set: Vec<Selection>,
}
pub struct Subscription {
    pub name: Name,
    pub variable_definitions: Vec<VariableDefinition>,
    pub directives: Vec<Directive>,
    pub selecion_set: Vec<Selection>,
}

pub struct Directive {
    pub name: Name,
    pub arguments: Vec<(Name, Value)>,
}

pub struct VariableDefinition {
    pub name: Name,
    pub var_type: VariableType,
    pub default_value: Option<Value>,
}

pub enum VariableType {
    NamedType(Name),
    ListType(Box<VariableType>),
    NonNullType(Box<VariableType>),
}

// TODO
pub struct Number;

pub enum Value {
    Variable(Name),
    Int(Number),
    Float(f64),
    String(String),
    Boolean(bool),
    Null,
    EnumValue(Name),
    ListValue(Vec<Value>),
    ObjectValue(BTreeMap<Name, Value>),
}

pub enum Selection {
    Field(Field),
    FragmentSpread(FragmentSpread),
    InlineFragment(InlineFragment),
}

pub struct Field {
    pub alias: Option<Name>,
    pub name: Name,
    pub arguments: Vec<(Name, Value)>,
    pub directives: Vec<Directive>,
    pub selection_set: Vec<Selection>,
}

pub struct FragmentSpread {
    pub fragment_name: Name,
    pub directives: Vec<Directive>,
}

pub enum TypeCondition {
    On(Name),
}

pub struct InlineFragment {
    pub type_condition: Option<TypeCondition>,
    pub directives: Vec<Directive>,
    pub selection_set: Vec<Selection>,
}
