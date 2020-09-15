use crate::context::QueryPlanningContext;
use graphql_parser::query::refs::{FragmentDefinitionRef, SelectionSetRef};

pub(crate) fn auto_fragmentation<'a, 'q: 'a>(
    context: &'q QueryPlanningContext<'q>,
    selection_set: SelectionSetRef<'q>,
) -> (Vec<FragmentDefinitionRef<'a>>, SelectionSetRef<'a>) {
    unimplemented!()
}

#[cfg(test)]
mod tests {
    use crate::autofrag::auto_fragmentation;
    use crate::context::QueryPlanningContext;
    use crate::federation::Federation;
    use crate::helpers::{build_possible_types, names_to_types, variable_name_to_def, Op};
    use graphql_parser::query::refs::SelectionSetRef;
    use graphql_parser::query::{Definition, Operation};
    use graphql_parser::{parse_query, parse_schema, DisplayMinified};
    use std::collections::HashMap;

    #[test]
    #[should_panic]
    fn test_auto_fragmentation() {
        let schema = "schema {
            query: Query
        }

        type Query {
            field: SomeField
        }

        interface IFace {
            x: Int
        }

        type IFaceImpl1 implements IFace { x: Int }
        type IFaceImpl2 implements IFace { x: Int }

        type SomeField {
          a: A
          b: B
          iface: IFace
        }

        type A {
          b: B
        }

        type B {
          f1: String
          f2: String
          f3: String
          f4: String
          f5: String
          f6: String
        }
        ";

        let query = "{
          field {
            a { b { f1 f2 f4 } }
            b { f1 f2 f4 }
            iface {
                ...on IFaceImpl1 { x }
                ...on IFaceImpl2 { x }
            }
          }
        }";

        let expected = parse_query(
            "
            fragment __QueryPlanFragment_1__ on B { f1 f2 f4 }
            {
                field {
                  a { b { ...__QueryPlanFragment_1__ } }
                  b { ...__QueryPlanFragment_1__ }
                }
            }
        ",
        )
        .unwrap()
        .minified();

        let schema = parse_schema(schema).unwrap();
        let query = parse_query(query).unwrap();
        let ss = letp!(Definition::SelectionSet(ref ss) = query.definitions[0] => ss);
        let operation = Op {
            selection_set: ss,
            kind: Operation::Query,
        };

        let types = names_to_types(&schema);
        let context = QueryPlanningContext {
            schema: &schema,
            operation,
            fragments: HashMap::new(),
            auto_fragmentization: true,
            possible_types: build_possible_types(&schema, &types),
            variable_name_to_def: variable_name_to_def(&query),
            federation: Federation::new(&schema),
            names_to_types: types,
        };
        let (frags, ssr) = auto_fragmentation(
            &context,
            SelectionSetRef::from(context.operation.selection_set),
        );
        assert_eq!(1, frags.len());
        let got = format!("{} {}", frags[0].minified(), ssr.minified());
        let new_query = parse_query(&got).unwrap().minified();
        assert_eq!(expected, new_query);
    }
}
