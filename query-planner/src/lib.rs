#[macro_use]
extern crate lazy_static;

use crate::builder::build_query_plan;
use crate::model::QueryPlan;
use graphql_parser::{parse_query, parse_schema, schema, ParseError};

#[macro_use]
mod macros;
mod builder;
mod consts;
mod context;
mod federation;
mod groups;
mod helpers;
pub mod model;
mod visitors;

#[derive(Debug)]
pub enum QueryPlanError {
    FailedParsingSchema(ParseError),
    FailedParsingQuery(ParseError),
    InvalidQuery(&'static str),
}

pub type Result<T> = std::result::Result<T, QueryPlanError>;

pub struct QueryPlanner<'s> {
    schema: schema::Document<'s>,
}

impl<'s> QueryPlanner<'s> {
    pub fn new(schema: &'s str) -> QueryPlanner<'s> {
        let schema = parse_schema(schema).expect("failed parsing schema");
        QueryPlanner { schema }
    }

    pub fn plan(&self, query: &str) -> Result<QueryPlan> {
        let query = parse_query(query).expect("failed parsing query");
        build_query_plan(&self.schema, &query)
    }
}
