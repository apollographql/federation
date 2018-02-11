//! Query Language Abstract Syntax Tree (AST)
//!
//! The types and fields here resemble official [graphql grammar] whenever it
//! makes sense for rust.
//!
//! [graphql grammar]: http://facebook.github.io/graphql/October2016/#sec-Appendix-Grammar-Summary
//!
use position::Pos;
pub use common::{Directive, Number, Value, Name, Type};

/// Root of query data
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
    pub position: Pos,
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
    pub position: Pos,
    pub name: Option<Name>,
    pub variable_definitions: Vec<VariableDefinition>,
    pub directives: Vec<Directive>,
    pub selection_set: SelectionSet,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Mutation {
    pub position: Pos,
    pub name: Option<Name>,
    pub variable_definitions: Vec<VariableDefinition>,
    pub directives: Vec<Directive>,
    pub selection_set: SelectionSet,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Subscription {
    pub position: Pos,
    pub name: Option<Name>,
    pub variable_definitions: Vec<VariableDefinition>,
    pub directives: Vec<Directive>,
    pub selection_set: SelectionSet,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SelectionSet {
    pub span: (Pos, Pos),
    pub items: Vec<Selection>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct VariableDefinition {
    pub position: Pos,
    pub name: Name,
    pub var_type: Type,
    pub default_value: Option<Value>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Selection {
    Field(Field),
    FragmentSpread(FragmentSpread),
    InlineFragment(InlineFragment),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Field {
    pub position: Pos,
    pub alias: Option<Name>,
    pub name: Name,
    pub arguments: Vec<(Name, Value)>,
    pub directives: Vec<Directive>,
    pub selection_set: SelectionSet,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FragmentSpread {
    pub position: Pos,
    pub fragment_name: Name,
    pub directives: Vec<Directive>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TypeCondition {
    On(Name),
}

#[derive(Debug, Clone, PartialEq)]
pub struct InlineFragment {
    pub position: Pos,
    pub type_condition: Option<TypeCondition>,
    pub directives: Vec<Directive>,
    pub selection_set: SelectionSet,
}
