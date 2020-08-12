use crate::builder::collect_fields;
use crate::consts;
use crate::federation::get_federation_metadata;
use crate::helpers::Op;
use crate::model::ResponsePathElement;
use crate::visitors::VariableUsagesMap;
use graphql_parser::query::refs::{FieldRef, SelectionSetRef};
use graphql_parser::query::*;
use graphql_parser::schema::TypeDefinition;
use graphql_parser::{schema, Name};
use linked_hash_map::LinkedHashMap;
use std::collections::HashMap;
use std::rc::Rc;

#[derive(Debug, Clone, PartialEq)]
pub struct QueryPlanningContext<'q> {
    pub schema: &'q schema::Document<'q>,
    pub operation: Op<'q>,
    pub fragments: HashMap<&'q str, &'q FragmentDefinition<'q>>,
    pub possible_types: HashMap<&'q str, Vec<&'q schema::ObjectType<'q>>>,
    pub names_to_types: HashMap<&'q str, &'q TypeDefinition<'q>>,
    pub variable_name_to_def: HashMap<&'q str, &'q VariableDefinition<'q>>,
    pub auto_fragmentization: bool,
}

impl<'q> QueryPlanningContext<'q> {
    pub fn new_scope(
        &self,
        parent_type: &'q TypeDefinition<'q>,
        enclosing_scope: Option<Rc<Scope<'q>>>,
    ) -> Rc<Scope<'q>> {
        let possible_types: Vec<&'q schema::ObjectType<'q>> = self
            .get_possible_types(parent_type)
            .iter()
            .copied()
            .filter(|t| {
                enclosing_scope
                    .as_ref()
                    .map(|enclosing_scope| enclosing_scope.possible_types.contains(t))
                    .unwrap_or(true)
            })
            .collect();

        Rc::new(Scope {
            parent_type,
            possible_types,
            enclosing_scope,
        })
    }

    pub fn get_type(&self, type_name: &str) -> &TypeDefinition {
        self.names_to_types[type_name]
    }

    fn get_possible_types(&self, td: &'q TypeDefinition<'q>) -> &Vec<&'q schema::ObjectType<'q>> {
        &self.possible_types[td.name().unwrap()]
    }

    pub fn get_variable_usages(
        &self,
        selection_set: &SelectionSetRef,
        fragments: &[&'q FragmentDefinition<'q>],
    ) -> (Vec<String>, Vec<&VariableDefinition>) {
        let mut v = selection_set
            .map(VariableUsagesMap::new(&self.variable_name_to_def))
            .output
            .unwrap();

        v.extend(fragments.iter().flat_map(|fd| {
            fd.selection_set
                .map(VariableUsagesMap::new(&self.variable_name_to_def))
                .output
                .unwrap()
        }));

        v.into_iter().unzip()
    }

    pub fn type_def_for_object(
        &self,
        obj: &'q schema::ObjectType<'q>,
    ) -> &'q schema::TypeDefinition<'q> {
        self.names_to_types[obj.name]
    }

    // TODO(ran) FIXME: we may be able to change this return type to &str
    pub fn get_base_service(&self, parent_type: &schema::ObjectType) -> String {
        get_federation_metadata(parent_type)
            .expect("Cannot find federation metadata")
            .service_name()
            .unwrap()
            .to_string()
    }

    pub fn get_owning_service(
        &self,
        parent_type: &schema::ObjectType,
        field_def: &schema::Field,
    ) -> String {
        match get_federation_metadata(field_def) {
            Some(fed_metadata)
                if fed_metadata.service_name().is_some()
                    && !fed_metadata.belongs_to_value_type() =>
            {
                fed_metadata.service_name().unwrap()
            }
            _ => self.get_base_service(parent_type),
        }
    }

    // TODO(ran) FIXME: for get_X_fields, we can calculate it once from the schema and put it in some maps or something.
    pub fn get_key_fields<'a>(
        &'q self,
        parent_type: &'q TypeDefinition<'q>,
        service_name: &'a str,
        fetch_all: bool,
    ) -> FieldSet<'q> {
        let mut key_fields = vec![];

        key_fields.push(Field {
            scope: self.new_scope(parent_type, None),
            field_node: (*consts::TYPENAME_QUERY_FIELD).clone(),
            field_def: &*consts::TYPENAME_SCHEMA_FIELD,
        });

        for possible_type in self.get_possible_types(parent_type) {
            let possible_type = *possible_type;
            let keys = get_federation_metadata(possible_type).and_then(|md| md.key(service_name));

            match keys {
                None => continue,
                Some(keys) if keys.is_empty() => continue,
                Some(keys) => {
                    let possible_type: &'q TypeDefinition<'q> =
                        self.type_def_for_object(possible_type);
                    let new_scope = self.new_scope(possible_type, None);

                    if fetch_all {
                        let collected_fields = keys.into_iter().flat_map(|key_directive| {
                            collect_fields(
                                self,
                                Rc::clone(&new_scope),
                                key_directive.selection_set(),
                            )
                        });
                        key_fields.extend(collected_fields);
                    } else {
                        if keys.len() > 1 {
                            panic!("We think this is not possible; get_key_fields should be \
                            called with fetch_all = false on cases where there's only one key for the service_name. \
                            Only for the extending service case. \
                            parent: {}, service_name: {}", parent_type.name().unwrap(), service_name);
                        }
                        let mut fields =
                            collect_fields(self, Rc::clone(&new_scope), keys[0].selection_set());
                        key_fields.append(&mut fields)
                    }
                }
            }
        }

        key_fields
    }

    pub fn get_required_fields<'a>(
        &'q self,
        parent_type: &'q TypeDefinition<'q>,
        field_def: &'q schema::Field<'q>,
        service_name: &'a str,
    ) -> FieldSet<'q> {
        let mut required_fields = self.get_key_fields(parent_type, service_name, false);

        if let Some(requires) = get_federation_metadata(field_def).and_then(|md| md.requires()) {
            let mut fields = collect_fields(
                self,
                self.new_scope(parent_type, None),
                requires.selection_set(),
            );
            required_fields.append(&mut fields);
        }

        required_fields
    }

    // TODO(ran) FIXME: we've discovered that provided fields is only used with
    //  matchesField which only uses the .field_def.name, so we really just care about
    //  field names, all collecting here does is "de-selection-set"ing the .provides
    //  value to get fields, which are later just use for getting names.
    pub fn get_provided_fields<'a>(
        &'q self,
        field_def: &'q schema::Field<'q>,
        service_name: &'a str,
    ) -> Vec<&'q str> {
        let return_type = self.names_to_types[field_def.field_type.name().unwrap()];
        let field_type_is_not_composite = !return_type.is_composite_type();

        if field_type_is_not_composite {
            return vec![];
        }

        let mut provided_fields: Vec<&'q str> = self
            .get_key_fields(return_type, service_name, true)
            .into_iter()
            .map(|f| f.field_def.name)
            .collect();

        if let Some(provides) = get_federation_metadata(field_def).and_then(|md| md.provides()) {
            let fields = collect_fields(
                self,
                self.new_scope(return_type, None),
                provides.selection_set(),
            )
            .into_iter()
            .map(|f| f.field_def.name);
            provided_fields.extend(fields);
        }

        provided_fields
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Scope<'q> {
    pub parent_type: &'q TypeDefinition<'q>,
    pub possible_types: Vec<&'q schema::ObjectType<'q>>,
    pub enclosing_scope: Option<Rc<Scope<'q>>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Field<'q> {
    pub scope: Rc<Scope<'q>>,
    pub field_node: FieldRef<'q>,
    pub field_def: &'q schema::Field<'q>,
}

pub type FieldSet<'q> = Vec<Field<'q>>;

#[derive(Debug, Clone)]
pub struct FetchGroup<'q> {
    pub service_name: String,
    pub fields: FieldSet<'q>,
    // This is only for auto_fragmentization -- which is currently unimplemented
    pub internal_fragments: LinkedHashMap<&'q str, &'q FragmentDefinition<'q>>,
    pub required_fields: FieldSet<'q>,
    pub provided_fields: Vec<&'q str>,
    pub dependent_groups_by_service: HashMap<String, FetchGroup<'q>>,
    pub other_dependent_groups: Vec<FetchGroup<'q>>,
    pub merge_at: Vec<ResponsePathElement>,
}

pub trait OwnedValues<'q> {
    fn owned_values(self) -> Vec<&'q FragmentDefinition<'q>>;
}

impl<'q> OwnedValues<'q> for LinkedHashMap<&'q str, &'q FragmentDefinition<'q>> {
    fn owned_values(self) -> Vec<&'q FragmentDefinition<'q>> {
        self.into_iter().map(|(_, v)| v).collect()
    }
}

impl<'q> FetchGroup<'q> {
    pub fn init(service_name: String) -> FetchGroup<'q> {
        FetchGroup::new(service_name, vec![], vec![])
    }

    pub fn new(
        service_name: String,
        merge_at: Vec<ResponsePathElement>,
        provided_fields: Vec<&'q str>,
    ) -> FetchGroup<'q> {
        FetchGroup {
            service_name,
            merge_at,
            provided_fields,

            fields: vec![],
            internal_fragments: LinkedHashMap::new(),
            required_fields: vec![],
            dependent_groups_by_service: HashMap::new(),
            other_dependent_groups: vec![],
        }
    }

    pub fn dependent_group_for_service<'a>(
        &'a mut self,
        service: String,
        required_fields: FieldSet<'q>,
    ) -> &'a mut FetchGroup<'q> {
        let group = self
            .dependent_groups_by_service
            .entry(service.clone())
            .or_insert_with(|| FetchGroup::init(service));

        if group.merge_at.is_empty() {
            group.merge_at = self.merge_at.clone();
        }

        if !required_fields.is_empty() {
            // TODO(ran) FIXME: this clones, ensure that's ok.
            group.required_fields.extend_from_slice(&required_fields);

            // TODO(ran) FIXME: consider using Rc for .fields and .required_fields
            self.fields.extend(required_fields.into_iter());
        }

        group
    }
}

// TODO(ran) FIXME: copy documentation comments from .ts
