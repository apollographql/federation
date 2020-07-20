use graphql_parser::ParseError;

pub mod builder;
mod context;
pub mod model;

#[derive(Debug)]
pub enum QueryPlanError {
    FailedParsingSchema(ParseError),
    FailedParsingQuery(ParseError),
    InvalidQuery(&'static str),
}
