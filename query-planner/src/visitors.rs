use graphql_parser::query::*;

pub struct VariableUsagesMap {}

impl graphql_parser::Map for VariableUsagesMap {
    type Output = Vec<String>;

    fn merge(&mut self, parent: Self::Output, child: Self::Output) -> Self::Output {
        let mut v = parent;
        let mut v2 = child;
        v.append(&mut v2);
        v
    }
}

impl Map for VariableUsagesMap {
    fn query(&mut self, _doc: &Document, _stack: &[Self::Output]) -> Self::Output {
        vec![]
    }

    fn query_def(&mut self, _def: &Definition, _stack: &[Self::Output]) -> Self::Output {
        vec![]
    }

    fn sel_set(&mut self, _sel_set: &SelectionSet, _stack: &[Self::Output]) -> Self::Output {
        vec![]
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

        if let Selection::Field(field) = sel {
            field
                .arguments
                .iter()
                .flat_map(|(_, v)| variable_usage_from_value(v))
                .collect()
        } else {
            vec![]
        }
    }
}
