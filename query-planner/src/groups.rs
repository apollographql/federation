use crate::context::{FetchGroup, QueryPlanningContext};
use graphql_parser::schema;
use graphql_parser::schema::TypeDefinition;
use std::collections::HashMap;

pub(crate) trait GroupForField<'q> {
    fn group_for_field<'a>(
        &'a mut self,
        td: &'q TypeDefinition<'q>,
        field: &'q schema::Field<'q>,
    ) -> &'a mut FetchGroup<'q>;

    fn into_groups(self) -> Vec<FetchGroup<'q>>;
}

pub struct GroupForService<'q> {
    pub context: &'q QueryPlanningContext<'q>,
    pub groups_map: HashMap<String, FetchGroup<'q>>,
}

impl<'q> GroupForField<'q> for GroupForService<'q> {
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
