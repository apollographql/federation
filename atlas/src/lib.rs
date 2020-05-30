use async_std::prelude::*;

use std::{mem::size_of, hash::Hash};
use chashmap::CHashMap;
// use log::debug;

use graphql_parser::schema::{Document, parse_schema, ParseError};

pub struct Schema<'a> {
    text: String,
    doc: Result<Document<'a>, ParseError>
}

impl<'a> Schema<'a> {
    fn from_source(text: &'a str) -> Schema {
        Schema {
            text: text.to_owned(),
            doc: parse_schema(text),
        }
    }
}

