use std::collections::BTreeMap;

type Name = String;


#[derive(Debug, Clone, PartialEq)]
pub struct Document {
    pub definitions: Vec<Definition>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Definition {
    Operation(OperationDefinition),
    Fragment(FragmentDefinition),
}

#[derive(Debug, Clone, PartialEq)]
pub struct FragmentDefinition {
    pub name: Name,
    pub type_condition: TypeCondition,
    pub directives: Vec<Directive>,
    pub selection_set: SelectionSet,
}

#[derive(Debug, Clone, PartialEq)]
pub enum OperationDefinition {
    SelectionSet(SelectionSet),
    Query(Query),
    Mutation(Mutation),
    Subscription(Subscription),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Query {
    pub name: Option<Name>,
    pub variable_definitions: Vec<VariableDefinition>,
    pub directives: Vec<Directive>,
    pub selection_set: SelectionSet,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Mutation {
    pub name: Option<Name>,
    pub variable_definitions: Vec<VariableDefinition>,
    pub directives: Vec<Directive>,
    pub selection_set: SelectionSet,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Subscription {
    pub name: Option<Name>,
    pub variable_definitions: Vec<VariableDefinition>,
    pub directives: Vec<Directive>,
    pub selecion_set: SelectionSet,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SelectionSet {
    pub items: Vec<Selection>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Directive {
    pub name: Name,
    pub arguments: Vec<(Name, Value)>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct VariableDefinition {
    pub name: Name,
    pub var_type: VariableType,
    pub default_value: Option<Value>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum VariableType {
    NamedType(Name),
    ListType(Box<VariableType>),
    NonNullType(Box<VariableType>),
}

#[derive(Debug, Clone, PartialEq)]
// we use i64 as a reference implementation: graphql-js thinks even 32bit
// integers is enough. We might consider lift this limit later though
pub struct Number(pub(crate) i64);

#[derive(Debug, Clone, PartialEq)]
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

#[derive(Debug, Clone, PartialEq)]
pub enum Selection {
    Field(Field),
    FragmentSpread(FragmentSpread),
    InlineFragment(InlineFragment),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Field {
    pub alias: Option<Name>,
    pub name: Name,
    pub arguments: Vec<(Name, Value)>,
    pub directives: Vec<Directive>,
    pub selection_set: SelectionSet,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FragmentSpread {
    pub fragment_name: Name,
    pub directives: Vec<Directive>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TypeCondition {
    On(Name),
}

#[derive(Debug, Clone, PartialEq)]
pub struct InlineFragment {
    pub type_condition: Option<TypeCondition>,
    pub directives: Vec<Directive>,
    pub selection_set: Vec<Selection>,
}
