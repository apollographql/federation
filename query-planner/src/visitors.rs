use std::collections::HashMap;

use linked_hash_map::LinkedHashMap;

use graphql_parser::query::refs::{SelectionRef, SelectionSetRef};
use graphql_parser::query::*;

pub struct VariableUsagesMap<'q> {
    variable_definitions: &'q HashMap<&'q str, &'q VariableDefinition<'q>>,
}

impl<'q> VariableUsagesMap<'q> {
    pub fn new(variable_definitions: &'q HashMap<&'q str, &'q VariableDefinition<'q>>) -> Self {
        Self {
            variable_definitions,
        }
    }
}

impl<'q> graphql_parser::Map for VariableUsagesMap<'q> {
    type Output = LinkedHashMap<String, &'q VariableDefinition<'q>>;

    fn merge(&mut self, parent: Self::Output, child: Self::Output) -> Self::Output {
        parent.into_iter().chain(child.into_iter()).collect()
    }
}

macro_rules! output_from_sel_args {
    (=> $iter:expr, $self:ident) => {
        $iter
            .map(|name| {
                let td = $self.variable_definitions[name.as_str()];
                (name, td)
            })
            .collect::<LinkedHashMap<String, &'q VariableDefinition<'q>>>()
    };
    ($args:ident, $self:ident) => {
        $args
            .arguments
            .iter()
            .flat_map(|(_, v)| variable_usage_from_value(&v))
    };
    (da $args:ident, $self:ident) => {
        output_from_sel_args!(=> output_from_sel_args!($args, $self).chain(
            $args
                .directives
                .iter()
                .flat_map(|d| &d.arguments)
                .flat_map(|(_, v)| variable_usage_from_value(&v)),
        ), $self)
    };
    (d $args:ident, $self:ident) => {
        output_from_sel_args!(=> $args
            .directives
            .iter()
            .flat_map(|d| &d.arguments)
            .flat_map(|(_, v)| variable_usage_from_value(&v)), $self)
    };
}

impl<'q> Map for VariableUsagesMap<'q> {
    fn query(&mut self, _doc: &Document, _stack: &[Self::Output]) -> Self::Output {
        LinkedHashMap::new()
    }

    fn query_def(&mut self, _def: &Definition, _stack: &[Self::Output]) -> Self::Output {
        LinkedHashMap::new()
    }

    fn sel_set(&mut self, _sel_set: &SelectionSet, _stack: &[Self::Output]) -> Self::Output {
        LinkedHashMap::new()
    }

    fn sel_set_ref(&mut self, _sel_set: &SelectionSetRef, _stack: &[Self::Output]) -> Self::Output {
        LinkedHashMap::new()
    }

    fn sel(&mut self, sel: &Selection, _stack: &[Self::Output]) -> Self::Output {
        match sel {
            Selection::Field(field) => output_from_sel_args!(da field, self),
            Selection::InlineFragment(inline) => output_from_sel_args!(d inline, self),
            Selection::FragmentSpread(spread) => output_from_sel_args!(d spread, self),
        }
    }

    fn sel_ref(&mut self, sel: &SelectionRef, stack: &[Self::Output]) -> Self::Output {
        match sel {
            SelectionRef::Ref(sel) => return self.sel(sel, stack),
            SelectionRef::Field(field) => output_from_sel_args!(da field, self),
            SelectionRef::FieldRef(field) => output_from_sel_args!(da field, self),
            SelectionRef::InlineFragmentRef(inline) => output_from_sel_args!(d inline, self),
        }
    }
}

fn variable_usage_from_value(value: &Value) -> Vec<String> {
    match value {
        Value::Variable(str) => vec![String::from(*str)],
        Value::List(values) => values.iter().flat_map(variable_usage_from_value).collect(),
        Value::Object(map) => map.values().flat_map(variable_usage_from_value).collect(),
        _ => vec![],
    }
}
