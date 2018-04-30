//! Graphql Parser
//! ==============
//!
//! This library contains full parser and formatter of the graphql
//! query language as well as AST types.
//!
//! [Docs](https://docs.rs/graphql-parser/) |
//! [Github](https://github.com/graphql-rust/graphql-parser/) |
//! [Crate](https://crates.io/crates/graphql-parser)
//!
//! Current this library supports full graphql syntax, and the following
//! extensions:
//!
//! 1. Subscriptions
//! 2. Block (triple quoted) strings
//! 3. Schema definition language a/k/a IDL (which is still in RFC)
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
//! Example: Parse and Format Schema
//! --------------------------------
//!
//! ```rust
//! # extern crate failure;
//! # extern crate graphql_parser;
//! use graphql_parser::parse_schema;
//!
//! # fn parse() -> Result<(), failure::Error> {
//! let ast = parse_schema(r#"
//!     schema {
//!         query: Query
//!     }
//!     type Query {
//!         users: [User!]!,
//!     }
//!     """
//!        Example user object
//!
//!        This is just a demo comment.
//!     """
//!     type User {
//!         name: String!,
//!     }
//! "#)?;
//! // Format canonical representation
//! assert_eq!(format!("{}", ast), "\
//! schema {
//!   query: Query
//! }
//!
//! type Query {
//!   users: [User!]!
//! }
//!
//! \"\"\"
//!   Example user object
//!
//!   This is just a demo comment.
//! \"\"\"
//! type User {
//!   name: String!
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


mod common;
#[macro_use]
mod format;
mod position;
mod tokenizer;
mod helpers;
pub mod query;
pub mod schema;

pub use query::parse_query;
pub use schema::parse_schema;
pub use position::Pos;
pub use format::Style;
