use crate::context::{FetchGroup, QueryPlanningContext};
use graphql_parser::schema;
use graphql_parser::schema::{Field, TypeDefinition};
use std::collections::HashMap;

pub(crate) trait GroupForField<'q> {
    fn group_for_field<'a>(
        &'a mut self,
        parent_type: &'q TypeDefinition<'q>,
        field_def: &'q Field<'q>,
    ) -> &'a mut FetchGroup<'q>;

    fn into_groups(self) -> Vec<FetchGroup<'q>>;
}

// Used by split_root_fields
pub struct ParallelGroupForField<'q> {
    pub context: &'q QueryPlanningContext<'q>,
    groups_map: HashMap<String, FetchGroup<'q>>,
}

impl<'q> ParallelGroupForField<'q> {
    pub fn new(context: &'q QueryPlanningContext<'q>) -> Self {
        Self {
            context,
            groups_map: HashMap::new(),
        }
    }
}

impl<'q> GroupForField<'q> for ParallelGroupForField<'q> {
    fn group_for_field<'a>(
        &'a mut self,
        parent_type: &'q TypeDefinition<'q>,
        field_def: &'q schema::Field<'q>,
    ) -> &'a mut FetchGroup<'q> {
        let service_name = self.context.get_owning_service(parent_type, field_def);

        self.groups_map
            .entry(service_name.clone())
            .or_insert_with(|| FetchGroup::init(service_name))
    }

    fn into_groups(self) -> Vec<FetchGroup<'q>> {
        self.groups_map.into_iter().map(|(_, v)| v).collect()
    }
}

// Used by split_root_fields_serially
pub struct SerialGroupForField<'q> {
    pub context: &'q QueryPlanningContext<'q>,
    pub groups: Vec<FetchGroup<'q>>,
}

impl<'q> SerialGroupForField<'q> {
    pub fn new(context: &'q QueryPlanningContext<'q>) -> Self {
        Self {
            context,
            groups: vec![],
        }
    }
}

impl<'q> GroupForField<'q> for SerialGroupForField<'q> {
    fn group_for_field<'a>(
        &'a mut self,
        parent_type: &'q TypeDefinition<'q>,
        field_def: &'q Field<'q>,
    ) -> &'a mut FetchGroup<'q> {
        let service_name = self.context.get_owning_service(parent_type, field_def);

        match self.groups.last() {
            Some(group) if group.service_name == service_name => (),
            _ => self.groups.push(FetchGroup::init(service_name)),
        }

        self.groups.last_mut().unwrap()
    }

    fn into_groups(self) -> Vec<FetchGroup<'q>> {
        self.groups
    }
}
