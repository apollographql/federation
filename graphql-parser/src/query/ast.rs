//! Query Language Abstract Syntax Tree (AST)
//!
//! The types and fields here resemble official [graphql grammar] whenever it
//! makes sense for rust.
//!
//! [graphql grammar]: http://facebook.github.io/graphql/October2016/#sec-Appendix-Grammar-Summary
//!
use crate::position::Pos;
pub use crate::common::{Directive, Number, Type, Value, Txt};

/// Root of query data
#[derive(Debug, Clone, PartialEq)]
pub struct Document<'a> {
    pub definitions: Vec<Definition<'a>>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Definition<'a> {
    Operation(OperationDefinition<'a>),
    Fragment(FragmentDefinition<'a>),
}

#[derive(Debug, Clone, PartialEq)]
pub struct FragmentDefinition<'a> {
    pub position: Pos,
    pub description: Option<String>,
    pub name: Txt<'a>,
    pub type_condition: TypeCondition<'a>,
    pub directives: Vec<Directive<'a>>,
    pub selection_set: SelectionSet<'a>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum OperationDefinition<'a> {
    SelectionSet(SelectionSet<'a>),
    Query(Query<'a>),
    Mutation(Mutation<'a>),
    Subscription(Subscription<'a>),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Query<'a> {
    pub position: Pos,
    pub description: Option<String>,
    pub name: Option<Txt<'a>>,
    pub variable_definitions: Vec<VariableDefinition<'a>>,
    pub directives: Vec<Directive<'a>>,
    pub selection_set: SelectionSet<'a>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Mutation<'a> {
    pub position: Pos,
    pub description: Option<String>,
    pub name: Option<Txt<'a>>,
    pub variable_definitions: Vec<VariableDefinition<'a>>,
    pub directives: Vec<Directive<'a>>,
    pub selection_set: SelectionSet<'a>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Subscription<'a> {
    pub position: Pos,
    pub description: Option<String>,
    pub name: Option<Txt<'a>>,
    pub variable_definitions: Vec<VariableDefinition<'a>>,
    pub directives: Vec<Directive<'a>>,
    pub selection_set: SelectionSet<'a>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SelectionSet<'a> {
    pub span: (Pos, Pos),
    pub items: Vec<Selection<'a>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct VariableDefinition<'a> {
    pub position: Pos,
    pub name: Txt<'a>,
    pub var_type: Type<'a>,
    pub default_value: Option<Value<'a>>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Selection<'a> {
    Field(Field<'a>),
    FragmentSpread(FragmentSpread<'a>),
    InlineFragment(InlineFragment<'a>),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Field<'a> {
    pub position: Pos,
    pub alias: Option<Txt<'a>>,
    pub name: Txt<'a>,
    pub arguments: Vec<(Txt<'a>, Value<'a>)>,
    pub directives: Vec<Directive<'a>>,
    pub selection_set: SelectionSet<'a>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FragmentSpread<'a> {
    pub position: Pos,
    pub fragment_name: Txt<'a>,
    pub directives: Vec<Directive<'a>>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TypeCondition<'a> {
    On(Txt<'a>),
}

#[derive(Debug, Clone, PartialEq)]
pub struct InlineFragment<'a> {
    pub position: Pos,
    pub type_condition: Option<TypeCondition<'a>>,
    pub directives: Vec<Directive<'a>>,
    pub selection_set: SelectionSet<'a>,
}
