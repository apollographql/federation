use graphql_parser::query::refs::{SelectionRef, SelectionSetRef};
use graphql_parser::query::*;
use linked_hash_map::LinkedHashMap;
use std::collections::HashMap;

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
        let names = if let Selection::Field(field) = sel {
            output_from_sel_args(&field.arguments)
        } else {
            vec![]
        };

        names
            .into_iter()
            .map(|name| {
                let fd = self.variable_definitions[name.as_str()];
                (name, fd)
            })
            .collect()
    }

    fn sel_ref(&mut self, sel: &SelectionRef, _stack: &[Self::Output]) -> Self::Output {
        let names = match sel {
            SelectionRef::Field(field) => output_from_sel_args(&field.arguments),
            SelectionRef::Ref(Selection::Field(field)) => output_from_sel_args(&field.arguments),
            SelectionRef::FieldRef(field) => output_from_sel_args(&field.arguments),
            _ => vec![],
        };

        names
            .into_iter()
            .map(|name| {
                let fd = self.variable_definitions[name.as_str()];
                (name, fd)
            })
            .collect()
    }
}

fn output_from_sel_args(args: &[(&str, Value)]) -> Vec<String> {
    args.iter()
        .flat_map(|(_, v)| variable_usage_from_value(v))
        .collect()
}

fn variable_usage_from_value(value: &Value) -> Vec<String> {
    match value {
        Value::Variable(str) => vec![String::from(*str)],
        Value::List(values) => values.iter().flat_map(variable_usage_from_value).collect(),
        Value::Object(map) => map.values().flat_map(variable_usage_from_value).collect(),
        _ => vec![],
    }
}
