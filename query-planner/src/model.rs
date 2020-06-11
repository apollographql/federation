use graphql_parser::query::SelectionSet;

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

pub struct QueryPlan<'a>(pub Option<PlanNode<'a>>);

pub struct FetchNode<'a> {
    pub service_name: String,
    pub variable_usages: Vec<String>,
    pub requires: Option<SelectionSet<'a>>,
    pub operation: String,
}

pub enum PlanNode<'a> {
    Sequence(Vec<PlanNode<'a>>),
    Parallel(Vec<PlanNode<'a>>),
    Fetch(Box<FetchNode<'a>>),
    Flatten {
        path: Vec<ResponsePathElement>,
        node: Box<PlanNode<'a>>,
    },
}
