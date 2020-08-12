use crate::context::{FetchGroup, QueryPlanningContext};
use crate::federation::get_federation_metadata;
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
    context: &'q QueryPlanningContext<'q>,
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
        let parent_type = match parent_type {
            TypeDefinition::Object(obj) => obj,
            _ => unreachable!(
                "Based on the .ts implementation, it's impossible to call this \
                function with a parent_type that is not an ObjectType"
            ),
        };

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
    context: &'q QueryPlanningContext<'q>,
    groups: Vec<FetchGroup<'q>>,
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
        let parent_type = match parent_type {
            TypeDefinition::Object(obj) => obj,
            _ => unreachable!(
                "Based on the .ts implementation, it's impossible to call this \
                function with a parent_type that is not an ObjectType"
            ),
        };

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

// Used by split_sub_fields
pub struct GroupForSubField<'q> {
    context: &'q QueryPlanningContext<'q>,
    parent_group: FetchGroup<'q>,
}

impl<'q> GroupForSubField<'q> {
    pub fn new(context: &'q QueryPlanningContext<'q>, parent_group: FetchGroup<'q>) -> Self {
        Self {
            context,
            parent_group,
        }
    }
}

impl<'q> GroupForField<'q> for GroupForSubField<'q> {
    fn group_for_field<'a>(
        &'a mut self,
        parent_type: &'q TypeDefinition<'q>,
        field_def: &'q Field<'q>,
    ) -> &'a mut FetchGroup<'q> {
        let obj_type = match parent_type {
            TypeDefinition::Object(obj) => obj,
            _ => unreachable!(
                "Based on the .ts implementation, it's impossible to call this \
                function with a parent_type that is not an ObjectType"
            ),
        };

        let (base_service, owning_service) = match get_federation_metadata(obj_type) {
            Some(metadata) if metadata.is_value_type() => (
                self.parent_group.service_name.clone(),
                self.parent_group.service_name.clone(),
            ),
            _ => (
                self.context.get_base_service(obj_type),
                self.context.get_owning_service(obj_type, field_def),
            ),
        };

        // Is the field defined on the base service?
        if owning_service == base_service {
            // Can we fetch the field from the parent group?
            if owning_service == self.parent_group.service_name
                || self
                    .parent_group
                    .provided_fields
                    .iter()
                    .any(|field_name| *field_name == field_def.name)
            {
                &mut self.parent_group
            } else {
                // We need to fetch the key fields from the parent group first, and then
                // use a dependent fetch from the owning service.
                let key_fields = self.context.get_key_fields(
                    parent_type,
                    &self.parent_group.service_name,
                    false,
                );
                // TODO(ran) FIXME: extern "__typename"
                let key_fields =
                    if key_fields.len() == 1 && key_fields[0].field_def.name == "__typename" {
                        // Only __typename key found.
                        // In some cases, the parent group does not have any @key directives.
                        // Fall back to owning group's keys
                        self.context
                            .get_key_fields(parent_type, &owning_service, false)
                    } else {
                        key_fields
                    };

                self.parent_group
                    .dependent_group_for_service(owning_service, key_fields)
            }
        } else {
            // It's an extension field, so we need to fetch the required fields first.
            let required_fields =
                self.context
                    .get_required_fields(parent_type, field_def, &owning_service);

            // Can we fetch the required fields from the parent group?
            let all_required_fields_are_provided = required_fields.iter().all(|required_field| {
                self.parent_group
                    .provided_fields
                    .iter()
                    .any(|field_name| *field_name == required_field.field_def.name)
            });
            if all_required_fields_are_provided {
                if owning_service == self.parent_group.service_name {
                    &mut self.parent_group
                } else {
                    self.parent_group
                        .dependent_group_for_service(owning_service, required_fields)
                }
            } else {
                // We need to go through the base group first.
                let key_fields = self.context.get_key_fields(
                    parent_type,
                    &self.parent_group.service_name,
                    false,
                );

                if base_service == self.parent_group.service_name {
                    self.parent_group
                        .dependent_group_for_service(owning_service, required_fields)
                } else {
                    self.parent_group
                        .dependent_group_for_service(base_service, key_fields)
                        .dependent_group_for_service(owning_service, required_fields)
                }
            }
        }
    }

    fn into_groups(self) -> Vec<FetchGroup<'q>> {
        vec![self.parent_group]
    }
}
