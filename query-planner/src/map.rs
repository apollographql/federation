use graphql_parser::query::*;
use graphql_parser::{query, schema, Name, Map};
use std::collections::HashMap;

pub struct QueryVisitor<'q, 's> {
    schema: &'s schema::Document<'s>,
    pub types: HashMap<&'s str, &'s schema::TypeDefinition<'s>>,
    pub fragments: HashMap<&'q str, &'q FragmentDefinition<'q>>,
}

pub struct QueryPlanFrame<'s> {
    pub parent_type_name: &'s str
}

impl<'q, 's: 'q> Map for QueryVisitor<'q, 's> {
    type Output = QueryPlanFrame<'s>;
}

impl<'q, 's: 'q> query::Map<'q> for QueryVisitor<'q, 's> {
    fn query<'a>(&'a mut self, doc: &'q Document<'q>, stack: &'a [Self::Output]) -> Self::Output {
        unimplemented!()
    }

    fn query_def<'a>(&'a mut self, def: &'q Definition<'q>, stack: &'a [Self::Output]) -> Self::Output {
        unimplemented!()
    }

    fn sel_set<'a>(&'a mut self, sel_set: &'q SelectionSet<'q>, stack: &'a [Self::Output]) -> Self::Output {
        unimplemented!()
    }

    fn sel<'a>(&'a mut self, sel: &'q Selection<'q>, stack: &'a [Self::Output]) -> Self::Output {
        unimplemented!()
    }
}

