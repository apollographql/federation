//! Graphql Parser
//! ==============
//!
//! This library contains full parser and formatter of the graphql
//! query language as well as AST types.
//!
//! [Docs](https://docs.rs/graphql-parser/) |
//! [Github](https://github.com/tailhook/graphql-parser/) |
//! [Crate](https://crates.io/crates/graphql-parser)
//!
//! Current this library supports full graphql syntax as well as block
//! (triple quoted) string addition which is not yet stable.
//!
//!
//! Example: Parse and Format Query
//! -------------------------------
//!
//! ```rust
//! # extern crate failure;
//! # extern crate graphql_parser;
//! use graphql_parser::parse_query;
//!
//! # fn parse() -> Result<(), failure::Error> {
//! let ast = parse_query("query MyQuery { field1, field2 }")?;
//! // Format canonical representation
//! assert_eq!(format!("{}", ast), "\
//! query MyQuery {
//!   field1
//!   field2
//! }
//! ");
//! # Ok(())
//! # }
//! # fn main() {
//! #    parse().unwrap()
//! # }
//! ```
//!
#![warn(missing_debug_implementations)]

extern crate combine;
#[macro_use] extern crate failure;
#[cfg(test)] #[macro_use] extern crate pretty_assertions;


mod position;
mod tokenizer;
mod helpers;
mod query_grammar;
mod query_error;
mod query_format;

pub mod format;
pub mod query;

pub use query_grammar::parse_query;
