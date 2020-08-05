use graphql_parser::query::*;
use std::collections::HashMap;

pub struct VariableUsagesMap<'q> {
    variable_definitions: &'q HashMap<&'q str, &'q VariableDefinition<'q>>,
}

impl<'q> VariableUsagesMap<'q> {
    pub fn new(
        variable_definitions: &'q HashMap<&'q str, &'q VariableDefinition<'q>>,
    ) -> VariableUsagesMap<'q> {
        VariableUsagesMap {
            variable_definitions,
        }
    }
}

impl<'q> graphql_parser::Map for VariableUsagesMap<'q> {
    type Output = HashMap<String, &'q VariableDefinition<'q>>;

    fn merge(&mut self, parent: Self::Output, child: Self::Output) -> Self::Output {
        parent.into_iter().chain(child.into_iter()).collect()
    }
}

impl<'q> Map for VariableUsagesMap<'q> {
    fn query(&mut self, _doc: &Document, _stack: &[Self::Output]) -> Self::Output {
        HashMap::new()
    }

    fn query_def(&mut self, _def: &Definition, _stack: &[Self::Output]) -> Self::Output {
        HashMap::new()
    }

    fn sel_set(&mut self, _sel_set: &SelectionSet, _stack: &[Self::Output]) -> Self::Output {
        HashMap::new()
    }

    fn sel(&mut self, sel: &Selection, _stack: &[Self::Output]) -> Self::Output {
        fn variable_usage_from_value(value: &Value) -> Vec<String> {
            match value {
                Value::Variable(str) => vec![String::from(*str)],
                Value::List(values) => values.iter().flat_map(variable_usage_from_value).collect(),
                Value::Object(map) => map.values().flat_map(variable_usage_from_value).collect(),
                _ => vec![],
            }
        }

        let names = if let Selection::Field(field) = sel {
            field
                .arguments
                .iter()
                .flat_map(|(_, v)| variable_usage_from_value(v))
                .collect()
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
}
