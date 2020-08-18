use crate::builder::collect_fields;
use crate::consts::{typename_field_def, typename_field_node};
use crate::federation::Federation;
use crate::helpers::Op;
use crate::visitors::VariableUsagesMap;
use graphql_parser::query::refs::{FieldRef, SelectionSetRef};
use graphql_parser::query::*;
use graphql_parser::schema::TypeDefinition;
use graphql_parser::{schema, Name};
use std::collections::HashMap;
use std::rc::Rc;

#[derive(Debug, PartialEq)]
pub struct QueryPlanningContext<'q> {
    pub schema: &'q schema::Document<'q>,
    pub operation: Op<'q>,
    pub fragments: HashMap<&'q str, &'q FragmentDefinition<'q>>,
    pub possible_types: HashMap<&'q str, Vec<&'q schema::ObjectType<'q>>>,
    pub names_to_types: HashMap<&'q str, &'q TypeDefinition<'q>>,
    pub variable_name_to_def: HashMap<&'q str, &'q VariableDefinition<'q>>,
    pub federation: Federation<'q>,
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
        self.federation
            .service_name_for_type(parent_type)
            .expect("Cannot find federation metadata")
    }

    pub fn get_owning_service(
        &self,
        parent_type: &schema::ObjectType,
        field_def: &schema::Field,
    ) -> String {
        self.federation
            .service_name_for_field(field_def)
            .unwrap_or_else(|| self.get_base_service(parent_type))
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
            field_node: typename_field_node(),
            field_def: typename_field_def(),
        });

        for possible_type in self.get_possible_types(parent_type) {
            let possible_type = *possible_type;
            let keys = self.federation.key(possible_type, service_name);

            match keys {
                None => continue,
                Some(keys) if keys.is_empty() => continue,
                Some(mut keys) => {
                    let possible_type: &'q TypeDefinition<'q> =
                        self.type_def_for_object(possible_type);
                    let new_scope = self.new_scope(possible_type, None);

                    if fetch_all {
                        let collected_fields = keys.into_iter().flat_map(|key_selection_set| {
                            collect_fields(self, new_scope.clone(), key_selection_set)
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
                            collect_fields(self, new_scope.clone(), keys.pop().unwrap());
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

        if let Some(requires) = self.federation.requires(field_def) {
            let mut fields = collect_fields(self, self.new_scope(parent_type, None), requires);
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
        let return_type = self
            .names_to_types
            .get(field_def.field_type.name().unwrap());
        let field_type_is_not_composite =
            return_type.is_none() || !return_type.unwrap().is_composite_type();

        if field_type_is_not_composite {
            return vec![];
        }

        let return_type = return_type.unwrap();

        let mut provided_fields: Vec<&'q str> = self
            .get_key_fields(return_type, service_name, true)
            .into_iter()
            .map(|f| f.field_def.name)
            .collect();

        if let Some(provides) = self.federation.provides(field_def) {
            // TODO(ran) FIXME: redundant allocations happening here.
            let fields = collect_fields(self, self.new_scope(return_type, None), provides)
                .into_iter()
                .map(|f| f.field_def.name);
            provided_fields.extend(fields);
        }

        provided_fields
    }
}

#[derive(Debug, PartialEq)]
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

// TODO(ran) FIXME: copy documentation comments from .ts
// TODO(ran) FIXME: audit all .clone() calls.
// TODO(ran) FIXME: add docstrings everywhere :)
// TODO(ran) FIXME: we need an @provides example in the csdl we're using in cucumber.
// TODO(ran) FIXME: look over use caes of .extend* and .append

/* TODO ACTUAL TASKS LEFT
1. complete minification implementation
2. make Parallel agnostic to ordering when implementing plan node equality
3. in split_fields, fix ordering of completing fields to match .ts
 */
