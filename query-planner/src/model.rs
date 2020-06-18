//! This is the model object for a QueryPlan trimmed down to only contain _owned_ fields
//! that are required for executing a QueryPlan as implemented in the existing Apollo Gateway.
//!
//! The [SelectionSet] in the `requires` field of a [FetchNode] is trimmed to only be a list of
//! either a [Field] or an [InlineFragment], since those are the only potential values needed to
//! execute a query plan. Furthermore, within a [Field] or [InlineFragment], we only need
//! names, aliases, type conditions, and recurively sub [SelectionSet]s.

use std::fmt;
use std::thread::JoinHandle;

#[derive(Debug, PartialEq)]
pub struct QueryPlan(pub Option<PlanNode>);

#[derive(Debug, PartialEq)]
pub enum PlanNode {
    Sequence(Vec<PlanNode>),
    Parallel(Vec<PlanNode>),
    Fetch(FetchNode),
    Flatten {
        path: Vec<ResponsePathElement>,
        node: Box<PlanNode>,
    },
}

#[derive(Debug, PartialEq)]
pub struct FetchNode {
    pub service_name: String,
    pub variable_usages: Vec<String>,
    pub requires: Option<SelectionSet>,
    pub operation: GraphQLDocument,
}

#[derive(Debug, PartialEq)]
pub enum Selection {
    Field(Field),
    InlineFragment(InlineFragment),
}

#[derive(Debug, PartialEq)]
pub struct Field {
    pub alias: Option<String>,
    pub name: String,
    pub selection_set: SelectionSet,
}

#[derive(Debug, PartialEq)]
pub struct InlineFragment {
    pub type_condition: Option<String>,
    pub selection_set: SelectionSet,
}

#[derive(Debug, PartialEq)]
pub enum ResponsePathElement {
    Field(String),
    Idx(u32),
}

impl fmt::Display for ResponsePathElement {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ResponsePathElement::Field(str) => str.fmt(f),
            ResponsePathElement::Idx(i) => i.fmt(f),
        }
    }
}

pub type SelectionSet = Vec<Selection>;
pub type GraphQLDocument = String;
