use std::collections::HashMap;
use std::iter::FromIterator;

use crate::dag::QueryPlanGraph;
use crate::model::QueryPlan;
use graphql_parser::query::*;
use graphql_parser::schema::TypeDefinition;
use graphql_parser::{query, schema, Name};

pub struct QueryVisitor<'q, 's> {
    pub types: HashMap<&'s str, &'s schema::TypeDefinition<'s>>,
    fragments: HashMap<&'q str, &'q FragmentDefinition<'q>>,
    stack: Vec<QueryPlanFrame<'s>>,
    dag: QueryPlanGraph,
}

impl<'q, 's: 'q> QueryVisitor<'q, 's> {
    pub fn new(
        schema: &'s schema::Document<'s>,
        query: &'q query::Document<'q>,
    ) -> QueryVisitor<'q, 's> {
        let types: HashMap<&'s str, &'s schema::TypeDefinition<'s>> = schema
            .definitions
            .iter()
            .flat_map(|d| match d {
                schema::Definition::Type(td) => Some(td),
                _ => None,
            })
            .map(|td| (td.name().unwrap(), td))
            .collect();

        let fragments: HashMap<&'q str, &FragmentDefinition<'q>> = query
            .definitions
            .iter()
            .flat_map(|d| match d {
                Definition::Fragment(frag) => Some((frag.name, frag)),
                _ => None,
            })
            .collect();

        QueryVisitor {
            types,
            fragments,
            stack: vec![],
            dag: QueryPlanGraph::new(),
        }
    }

    pub fn into_query_plan(self, is_query: bool) -> QueryPlan {
        self.dag.into_query_plan(is_query)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct QueryPlanFrame<'s> {
    pub parent_type: &'s schema::TypeDefinition<'s>,
    /// Must be Some when visiting fields NOT on Query/Mutation.
    pub owner_service: Option<String>,
    /// Must be non empty when visiting fields NOT on Query/Mutation.
    pub path: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FetchGroup<'q, 's: 'q> {
    pub service: &'s str,
    // TODO(ran) FIXME: add internalFragments (see js)
    pub field_set: Vec<Field<'q, 's>>,
    pub dependent_groups_by_service: HashMap<&'s str, FetchGroup<'q, 's>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Field<'q, 's: 'q> {
    parent: &'s schema::TypeDefinition<'s>,
    field_node: &'q query::Field<'q>,
    field_def: &'s schema::Field<'s>,
}

impl<'q, 's: 'q> query::Visitor<'q> for QueryVisitor<'q, 's> {
    fn enter_query_def<'a>(&'a mut self, def: &'q Definition<'q>) -> bool
    where
        'q: 'a,
    {
        if let Definition::Fragment(_) = def {
            return false;
        }

        let is_query = match def {
            Definition::SelectionSet(_) => true,
            Definition::Operation(op) => op.kind == Operation::Query,
            _ => false,
        };

        let parent_type = if is_query {
            self.types["Query"]
        } else {
            self.types["Mutation"]
        };

        let frame = QueryPlanFrame {
            parent_type,
            owner_service: None,
            path: vec![],
        };

        self.stack.push(frame);

        true
    }

    fn enter_sel<'a>(&'a mut self, sel: &'q Selection<'q>) -> bool
    where
        'q: 'a,
    {
        let frame = self.stack.last().unwrap();
        match sel {
            Selection::Field(field) => {
                // TODO(ran) FIXME: handle __typename because it can be on any type

                // create the path of the current field in the query
                let path = vec_concat(&frame.path, field.name.clone());

                // Get the field definition of the current field.
                let field_def = {
                    let parent_fields = match frame.parent_type {
                        TypeDefinition::Object(object) => &object.fields,
                        TypeDefinition::Interface(iface) => &iface.fields,
                        _ => panic!("We are only visiting fields when the parent type is an object or interface"),
                    };

                    parent_fields.iter().find(|f| f.name == field.name).unwrap()
                };

                if field.selection_set.items.is_empty() {
                    // TODO(ran) FIXME: any DAG nodes created here should depend on any that might
                    //  be in the stack frame.
                    // check if there are dependencies
                    // append to ops
                    unimplemented!()
                } else {
                    let owner_service: Option<String> =
                        find_resolve_directive_graph(field_def).or(frame.owner_service.clone());

                    let new_frame = QueryPlanFrame {
                        parent_type: self.types[field_def.field_type.name().unwrap()],
                        path,
                        owner_service,
                    };

                    // TODO(ran) FIXME: if there is a resolve, there has to be some dependency.
                    //  check parent type, iterate over @key directives, there has to be only one
                    //  where graph == @resolve(graph) from the field def.
                    //  if the field def also has @requires, we need to get that as well as the key.
                    //  we need to keep track of DAG nodes we've created in the stack so that
                    //  any other DAG nodes we create below this AST nodes depend on them.

                    // We push a new frame and do nothing, ops are pushed only on leaves.
                    // The visitor will use this on further visits.
                    self.stack.push(new_frame);
                }
            }

            Selection::InlineFragment(inline) => {
                if let Some(tc) = inline.type_condition {
                    let mut new_frame = frame.clone();
                    new_frame.parent_type = self.types[tc];
                    self.stack.push(new_frame);
                }
            }

            Selection::FragmentSpread(spread) => {
                let frag = self.fragments[spread.fragment_name];
                let tc = frag.type_condition;
                let mut new_frame = frame.clone();
                new_frame.parent_type = self.types[tc];
                // TODO(ran) FIXME: do we need a new owner service??
                self.stack.push(new_frame);
                // NB: The visitor Node implementation for Selection does nothing for FragmentSpread
                frag.selection_set.accept(self);
            }
        };

        true
    }

    fn leave_sel<'a>(&'a mut self, sel: &'q Selection<'q>)
    where
        'q: 'a,
    {
        let do_pop = match sel {
            Selection::Field(field) if !field.selection_set.items.is_empty() => true,
            Selection::InlineFragment(inline) if inline.type_condition.is_some() => true,
            Selection::FragmentSpread(_) => true,
            _ => false,
        };

        if do_pop {
            self.stack.pop();
        };
    }

    fn leave_query_def<'a>(&'a mut self, _def: &'q Definition<'q>)
    where
        'q: 'a,
    {
        // NB: The stack might be empty.
        self.stack.pop();
    }
}

fn vec_concat(v1: &Vec<String>, s: &str) -> Vec<String> {
    let mut v = Vec::from_iter(v1.iter().map(|s| s.clone()));
    v.push(String::from(s));
    v
}

fn find_resolve_directive_graph(field_def: &schema::Field) -> Option<String> {
    field_def
        .directives
        .iter()
        .find(|d| d.name == "resolve")
        .and_then(|d| d.arguments.iter().find(|(k, _)| *k == "graph"))
        .map(|(_, v)| {
            if let Value::String(v) = v {
                v.clone()
            } else {
                panic!("The `graph` value in the `resolve` directive must be a Value::String")
            }
        })
}
