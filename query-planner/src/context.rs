use std::collections::HashMap;
use std::iter::FromIterator;

use graphql_parser::query::*;
use graphql_parser::query;
use graphql_parser::{schema, Name};

struct QueryPlanContext<'q> {
    pub fragments: HashMap<&'q str, &'q FragmentDefinition<'q>>,
}

pub struct QueryPlanVisitor<'q, 's> {
    schema: &'q schema::Document<'s>,
    pub types: HashMap<&'s str, &'s schema::TypeDefinition<'s>>,
    context: QueryPlanContext<'q>,
    // TODO(ran) FIXME: hack
    in_fragments: bool,
}

impl<'q, 's: 'q> QueryPlanVisitor<'q, 's> {
    pub fn new(schema: &'s schema::Document<'s>) -> QueryPlanVisitor<'q, 's> {
        let types: HashMap<&'s str, &'s schema::TypeDefinition<'s>> = schema
            .definitions
            .iter()
            .flat_map(|d| match d {
                schema::Definition::Type(td) => Some(td),
                _ => None,
            })
            .map(|td| (td.name().unwrap(), td))
            .collect();

        QueryPlanVisitor {
            schema,
            types,
            context: QueryPlanContext { fragments: HashMap::new() },
            in_fragments: false,
        }
    }
}

impl<'q, 's: 'q> Visitor<'q> for QueryPlanVisitor<'q, 's> {
    fn enter_query<'a>(&'a mut self, query: &'q Document<'q>)
    where
        'q: 'a,
    {
        let fragments: HashMap<&'q str, &FragmentDefinition<'q>> = query
            .definitions
            .iter()
            .flat_map(|d| match d {
                Definition::Fragment(frag) => Some((frag.name, frag)),
                _ => None,
            })
            .collect();

        self.context.fragments.extend(fragments)
    }

    fn enter_query_def<'a>(&'a mut self, def: &'q Definition<'q>)
    where
        'q: 'a,
    {
        if let Definition::Fragment(_) = def {
            self.in_fragments = true
        }
    }

    fn enter_sel<'a>(&'a mut self, sel: &'q Selection<'q>)
    where
        'q: 'a,
    {
        if self.in_fragments {
           return
        }

        match sel {
            Selection::Field(field) => unimplemented!(),
            Selection::FragmentSpread(fs) => unimplemented!(),
            Selection::InlineFragment(inline) => unimplemented!(),
        }
    }

    fn leave_query_def<'a>(&'a mut self, def: &'q Definition<'q>)
    where
        'q: 'a,
    {
        if let Definition::Fragment(_) = def {
            self.in_fragments = false
        }
    }
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

