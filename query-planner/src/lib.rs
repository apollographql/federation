#[macro_use]
extern crate lazy_static;

#[macro_use]
extern crate derive_builder;

pub use crate::model::QueryPlan;
use graphql_parser::{parse_schema, parse_query, schema, ParseError};
use serde::{Deserialize, Serialize};

#[macro_use]
mod macros;
mod autofrag;
mod builder;
mod consts;
mod context;
mod federation;
mod groups;
pub mod helpers;
pub mod model;
mod visitors;

#[derive(Debug)]
pub enum QueryPlanError {
    FailedParsingSchema(ParseError),
    FailedParsingQuery(ParseError),
    InvalidQuery(&'static str),
}

pub type Result<T> = std::result::Result<T, QueryPlanError>;

pub use using::Schema;

#[derive(Debug)]
pub struct QueryPlanner<'s> {
    pub schema: using::Schema<'s>,
}

impl<'s> QueryPlanner<'s> {
    pub fn new(schema: &'s str) -> QueryPlanner<'s> {
        let schema = Schema::parse(schema).expect("failed parsing schema");
        QueryPlanner { schema }
    }

    // TODO(ran) FIXME: make options a field on the planner.
    pub fn plan(&self, query: &str, options: QueryPlanningOptions) -> Result<QueryPlan> {
        let query = parse_query(query).expect("failed parsing query");
        self.build_query_plan(&query, options)
    }
}

// NB: By deriving Builder (using the derive_builder crate) we automatically implement
// the builder pattern for arbitrary structs.
// simple #[derive(Builder)] will generate a FooBuilder for your struct Foo with all setter-methods and a build method.
#[derive(Default, Builder, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryPlanningOptions {
    #[builder(default)]
    pub auto_fragmentization: bool,
}
