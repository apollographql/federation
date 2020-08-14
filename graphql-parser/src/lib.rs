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
//! use graphql_parser::{parse_query, ParseError};
//!
//! let ast = parse_query("query MyQuery { field1, field2 }").unwrap();
//! // Format canonical representation
//! assert_eq!(format!("{}", ast), "\
//! query MyQuery {
//!   field1
//!   field2
//! }
//! ");
//! ```
//!
//! Example: Parse and Format Schema
//! --------------------------------
//!
//! ```rust
//! use graphql_parser::{parse_schema, ParseError};
//!
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
//! "#).unwrap().to_owned();
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
//! ```
//!
//! Visitors
//! ========
//!
//! Visitors help traverse and map ASTs into other forms.
//!
//! Example: Visit every field
//! --------------------------
//! You can use visitors to collect data from the AST.
//!
//! ```
//! use graphql_parser::{parse_schema, Name, schema, query, schema::Node};
//!
//! let ast = parse_schema(r###"
//! type MyType {
//!   fieldA: Int
//!   fieldB: String
//!   fieldC: [String]  
//! }
//! "###).unwrap();
//!
//! struct Fields {
//!     output: Vec<String>
//! };
//!
//! /// Schemas can contain queries, so all visitors must at least implement query::Visitor.
//! impl query::Visitor for Fields {}
//!
//! /// To collect field definitions, we'll also want to implement the appropriate method of
//! /// schema::Visitor
//! impl schema::Visitor for Fields {
//!     fn enter_field<'a>(&mut self, field: &schema::Field<'a>) {
//!         self.output.push(String::from(field.name().unwrap()));
//!     }
//! }
//!
//! let mut fields = Fields { output: vec![] };
//! ast.accept(&mut fields);
//! assert_eq!(fields.output, vec!["fieldA", "fieldB", "fieldC"]);
//! ```
//!
//! Example: Map a query into a string
//! ----------------------------------
//! You can also `map` an AST into another form.
//!
//! ```rust
//! use graphql_parser::{parse_query, Map, query, query::{Node, Document, Definition, SelectionSet, Selection}};
//! use graphql_parser::query::refs::{SelectionRef, SelectionSetRef};
//! let ast = graphql_parser::parse_query(r#"
//! query {
//!     someField
//!     another { ...withFragment @directive }
//! }
//! "#).unwrap();
//! struct ToIndentedNodeTypes {}
//!
//! impl Map for ToIndentedNodeTypes {
//!     // We're mapping the query AST into a string
//!     type Output = String;
//!     // The *merge* function controls how we merge child output data up the tree
//!     // when the map of the child is complete. Here we join parent and child
//!     // with a newline.
//!     fn merge(&mut self, parent: String, child: String) -> String {
//!         format!("{}\n{}", parent, child)
//!     }
//! }
//!
//! impl query::Map for ToIndentedNodeTypes {
//!     fn query<'a>(&mut self, _: &Document<'a>, stack: &[Self::Output]) -> Self::Output {
//!         format!("{}query", "  ".repeat(stack.len()))
//!     }
//!     fn query_def<'a>(&mut self, _: &Definition<'a>, stack: &[Self::Output]) -> Self::Output {
//!         format!("{}query_def", "  ".repeat(stack.len()))
//!     }
//!     fn sel_set<'a>(&mut self, _: &SelectionSet<'a>, stack: &[Self::Output]) -> Self::Output {
//!         format!("{}sel_set", "  ".repeat(stack.len()))
//!     }
//!     fn sel_set_ref(&mut self,sel_set: &SelectionSetRef<'a>,stack: &[Self::Output]) -> Self::Output {
//!         unreachable!()
//!     }
//!     fn sel<'a>(&mut self, _: &Selection<'a>, stack: &[Self::Output]) -> Self::Output {
//!         format!("{}sel", "  ".repeat(stack.len()))
//!     }
//!     fn sel_ref(&mut self,sel: &SelectionRef<'a>,stack: &[Self::Output]) -> Self::Output {
//!         unreachable!()
//!     }
//! }
//!
//! let tx = ast.map(ToIndentedNodeTypes{});
//! pretty_assertions::assert_eq!(tx.output, Some(String::from("query
//!   query_def
//!     sel_set
//!       sel
//!         sel_set
//!       sel
//!         sel_set
//!           sel")));
//! ```
#![warn(missing_debug_implementations)]

#[cfg(test)]
#[macro_use]
extern crate pretty_assertions;

mod common;
#[macro_use]
mod format;
mod error;
mod helpers;
mod visit;
pub use error::*;

mod position;
pub mod query;
pub mod schema;
mod tokenizer;

pub use crate::format::DisplayMinified;
pub use crate::format::Style;
pub use crate::position::Pos;
pub use crate::query::parse_query;
pub use crate::schema::parse_schema;

mod name;
pub use crate::name::*;
pub use visit::Map;
