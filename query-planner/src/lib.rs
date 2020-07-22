use graphql_parser::ParseError;

pub mod builder;
pub mod model;
mod visitor;

#[derive(Debug)]
pub enum QueryPlanError {
    FailedParsingSchema(ParseError),
    FailedParsingQuery(ParseError),
    InvalidQuery(&'static str),
}

type Result<T> = std::result::Result<T, QueryPlanError>;
