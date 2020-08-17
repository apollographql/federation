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

#[cfg(test)]
mod tests {
    use crate::builder::build_query_plan;
    use crate::model::QueryPlan;
    use graphql_parser::{parse_query, parse_schema};

    static SCHEMA: &str = include_str!("../tests/features/csdl.graphql");

    #[test]
    fn temp_test_case_copied_from_cucumber() {
        let query = include_str!("../tests/temp_query.graphql");
        let query = parse_query(query).unwrap();
        let schema = parse_schema(SCHEMA).unwrap();

        let result = build_query_plan(&schema, &query).unwrap();
        let expected: QueryPlan =
            serde_json::from_str(include_str!("../tests/temp_query_result.json")).unwrap();

        assert_eq!(result, expected);
    }
}
