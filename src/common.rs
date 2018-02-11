use std::collections::BTreeMap;

use position::Pos;


/// An alias for string, used where graphql expects a name
pub type Name = String;

#[derive(Debug, Clone, PartialEq)]
pub struct Directive {
    pub position: Pos,
    pub name: Name,
    pub arguments: Vec<(Name, Value)>,
}

/// This represents integer number
///
/// But since there is no definition on limit of number in spec
/// (only in implemetation), we do a trick similar to the one
/// in `serde_json`: encapsulate value in new-type, allowing type
/// to be extended later.
#[derive(Debug, Clone, PartialEq)]
// we use i64 as a reference implementation: graphql-js thinks even 32bit
// integers is enough. We might consider lift this limit later though
pub struct Number(pub(crate) i64);

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Variable(Name),
    Int(Number),
    Float(f64),
    String(String),
    Boolean(bool),
    Null,
    Enum(Name),
    List(Vec<Value>),
    Object(BTreeMap<Name, Value>),
}

#[derive(Debug, Clone, PartialEq)]
pub enum Type {
    NamedType(Name),
    ListType(Box<Type>),
    NonNullType(Box<Type>),
}

impl Number {
    /// Returns a number as i64 if it fits the type
    pub fn as_i64(&self) -> Option<i64> {
        Some(self.0)
    }
}
