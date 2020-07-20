use graphql_parser::query::*;
use graphql_parser::{query, schema, Map, Name};
use std::collections::HashMap;

pub struct QueryVisitor<'q, 's> {
    schema: &'s schema::Document<'s>,
    types: HashMap<&'s str, &'s schema::TypeDefinition<'s>>,
    fragments: HashMap<&'q str, &'q FragmentDefinition<'q>>,
    stack: Vec<QueryPlanFrame<'s>>
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
            schema,
            types,
            fragments,
            stack: vec![]
        }
    }
}

pub struct QueryPlanFrame<'s> {
    pub parent_type_name: &'s schema::TypeDefinition<'s>,
    pub field_def: Option<&'s schema::FragmentDefinition<'s>>
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
    fn enter_query<'a>(&'a mut self, doc: &'q Document<'q>) where
        'q: 'a, {
        unimplemented!()
    }

    fn enter_query_def<'a>(&'a mut self, def: &'q Definition<'q>) where
        'q: 'a, {
        unimplemented!()
    }

    fn enter_sel_set<'a>(&'a mut self, sel_set: &'q SelectionSet<'q>) where
        'q: 'a, {
        unimplemented!()
    }

    fn enter_sel<'a>(&'a mut self, sel: &'q Selection<'q>) where
        'q: 'a, {
        unimplemented!()
    }

    fn leave_sel<'a>(&'a mut self, sel: &'q Selection<'q>) where
        'q: 'a, {
        unimplemented!()
    }

    fn leave_sel_set<'a>(&'a mut self, sel_set: &'q SelectionSet<'q>) where
        'q: 'a, {
        unimplemented!()
    }

    fn leave_query_def<'a>(&'a mut self, def: &'q Definition<'q>) where
        'q: 'a, {
        unimplemented!()
    }

    fn leave_query<'a>(&'a mut self, doc: &'q Document<'q>) where
        'q: 'a, {
        unimplemented!()
    }
}
