use std::collections::HashMap;

use indexmap::IndexSet;

use graphql_parser::query::{FragmentDefinition, SelectionSet, VariableDefinition};

use crate::serialize;

pub enum ResponsePathElement {
    Field(String),
    Idx(u32),
}

impl ToString for ResponsePathElement {
    fn to_string(&self) -> String {
        match self {
            ResponsePathElement::Field(str) => str.to_string(),
            ResponsePathElement::Idx(i) => i.to_string(),
        }
    }
}

pub struct QueryPlan<'a> {
    pub node: Option<PlanNode<'a>>,
}

pub struct FetchNode<'a> {
    pub service_name: String,
    pub selection_set: SelectionSet<'a>,
    pub variable_usages: Option<HashMap<String, VariableDefinition<'a>>>,
    pub requires: Option<SelectionSet<'a>>,
    pub internal_fragments: IndexSet<FragmentDefinition<'a>>,
    pub source: String,
}

pub enum PlanNode<'a> {
    Sequence {
        nodes: Vec<PlanNode<'a>>,
    },
    Parallel {
        nodes: Vec<PlanNode<'a>>,
    },
    Fetch(Box<FetchNode<'a>>),
    Flatten {
        path: Vec<ResponsePathElement>,
        node: Box<PlanNode<'a>>,
    },
}

impl<'a> QueryPlan<'a> {
    fn serialize(&self) -> String {
        serialize::serialize(self)
    }
}
