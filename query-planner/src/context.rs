use crate::builder::collect_fields;
use crate::consts::{typename_field_def, typename_field_node};
use crate::federation::Federation;
use crate::helpers::Op;
use crate::visitors::VariableUsagesMap;
use crate::QueryPlanningOptions;
use graphql_parser::query::refs::{FieldRef, Node, SelectionRef, SelectionSetRef};
use graphql_parser::query::*;
use graphql_parser::schema::TypeDefinition;
use graphql_parser::{schema, Name};
use std::collections::{HashMap, HashSet};
use std::rc::Rc;

#[derive(Debug)]
pub(crate) struct QueryPlanningContext<'q> {
    pub schema: &'q schema::Document<'q>,
    pub operation: Op<'q>,
    pub fragments: HashMap<&'q str, &'q FragmentDefinition<'q>>,
    pub possible_types: HashMap<&'q str, Vec<&'q schema::ObjectType<'q>>>,
    pub names_to_types: HashMap<&'q str, &'q TypeDefinition<'q>>,
    pub variable_name_to_def: HashMap<&'q str, &'q VariableDefinition<'q>>,
    pub federation: Federation<'q>,
    pub options: QueryPlanningOptions,
}

impl<'q> QueryPlanningContext<'q> {
    pub(crate) fn new_scope_with_directives(
        &self,
        parent_type: &'q TypeDefinition<'q>,
        enclosing_scope: Option<Rc<Scope<'q>>>,
        scope_directives: Option<&'q Vec<Directive<'q>>>,
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
            scope_directives,
        })
    }

    pub(crate) fn new_scope(
        &self,
        parent_type: &'q TypeDefinition<'q>,
        enclosing_scope: Option<Rc<Scope<'q>>>,
    ) -> Rc<Scope<'q>> {
        self.new_scope_with_directives(parent_type, enclosing_scope, None)
    }

    fn get_possible_types(&self, td: &'q TypeDefinition<'q>) -> &Vec<&'q schema::ObjectType<'q>> {
        &self.possible_types[td.as_name()]
    }

    pub(crate) fn get_variable_usages(
        &self,
        selection_set: &SelectionSetRef,
    ) -> (Vec<String>, Vec<&VariableDefinition>) {
        selection_set
            .map(VariableUsagesMap::new(&self.variable_name_to_def))
            .output
            .expect("output must be Some")
            .into_iter()
            .unzip()
    }

    pub(crate) fn type_def_for_object(
        &self,
        obj: &'q schema::ObjectType<'q>,
    ) -> &'q schema::TypeDefinition<'q> {
        self.names_to_types[obj.name]
    }

    // TODO(ran)(p2)(#114) we may be able to change this return type to &str
    pub(crate) fn get_base_service(
        &self,
        parent_type: &schema::ObjectType,
        field_def: &schema::Field,
    ) -> String {
        self.federation
            .service_name_for_type(parent_type)
            .or_else(|| self.federation.service_name_for_field(field_def))
            .expect(&format!("Cannot find federation metadata for {type}", type=parent_type.name))
    }

    pub(crate) fn get_owning_service(
        &self,
        parent_type: &schema::ObjectType,
        field_def: &schema::Field,
    ) -> String {
        self.federation
            .service_name_for_field(field_def)
            .unwrap_or_else(|| self.get_base_service(parent_type, field_def))
    }

    // TODO(ran)(p2)(#114) for get_X_fields, we can calculate it once from the schema and put it in some maps or something.
    pub(crate) fn get_key_fields<'a>(
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
                            parent: {}, service_name: {}", parent_type.as_name(), service_name);
                        }
                        let mut fields = collect_fields(
                            self,
                            new_scope.clone(),
                            keys.pop().expect("keys is not empty"),
                        );
                        key_fields.append(&mut fields)
                    }
                }
            }
        }

        key_fields
    }

    pub(crate) fn get_required_fields<'a>(
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

    pub(crate) fn get_provided_fields<'a>(
        &'q self,
        field_def: &'q schema::Field<'q>,
        service_name: &'a str,
    ) -> Vec<&'q str> {
        // N.B. this is similar to collect_fields, except we don't care about creating
        //  redundant field nodes and scopes and stuff, we just want field names.
        fn collect_fields_names<'a, 'q>(
            selection_set: SelectionSetRef<'q>,
            fragments: &'a HashMap<&'q str, &'q FragmentDefinition<'q>>,
            res: &'a mut Vec<&'q str>,
            visited_fragment_names: &'a mut HashSet<&'q str>,
        ) {
            for selection in selection_set.items.into_iter() {
                match selection {
                    SelectionRef::FieldRef(field) => res.push(field.name),
                    SelectionRef::Field(field) | SelectionRef::Ref(Selection::Field(field)) => {
                        res.push(field.name)
                    }
                    SelectionRef::Ref(Selection::InlineFragment(inline)) => collect_fields_names(
                        SelectionSetRef::from(&inline.selection_set),
                        fragments,
                        res,
                        visited_fragment_names,
                    ),
                    SelectionRef::InlineFragmentRef(inline_ref) => collect_fields_names(
                        inline_ref.selection_set,
                        fragments,
                        res,
                        visited_fragment_names,
                    ),
                    SelectionRef::Ref(Selection::FragmentSpread(spread)) => {
                        let fragment = fragments[spread.fragment_name];
                        if !visited_fragment_names.contains(spread.fragment_name) {
                            collect_fields_names(
                                SelectionSetRef::from(&fragment.selection_set),
                                fragments,
                                res,
                                visited_fragment_names,
                            )
                        }
                    }
                    SelectionRef::FragmentSpreadRef(_) => {
                        unreachable!("FragmentSpreadRef is only used at the end of query planning")
                    }
                }
            }
        }

        let return_type = self.names_to_types.get(field_def.field_type.as_name());

        if let Some(return_type) = return_type {
            if !return_type.is_composite_type() {
                return vec![];
            }

            let provided_fields = self
                .get_key_fields(return_type, service_name, true)
                .into_iter()
                .map(|f| f.field_def.name);

            if let Some(provides) = self.federation.provides(field_def) {
                let fields = {
                    let mut visited_fragment_names: HashSet<&str> = HashSet::new();
                    let mut res = vec![];
                    collect_fields_names(
                        provides,
                        &self.fragments,
                        &mut res,
                        &mut visited_fragment_names,
                    );
                    res
                };
                provided_fields.chain(fields).collect()
            } else {
                provided_fields.collect()
            }
        } else {
            vec![]
        }
    }
}

#[derive(Debug, PartialEq)]
pub(crate) struct Scope<'q> {
    pub parent_type: &'q TypeDefinition<'q>,
    pub possible_types: Vec<&'q schema::ObjectType<'q>>,
    pub enclosing_scope: Option<Rc<Scope<'q>>>,
    pub scope_directives: Option<&'q Vec<Directive<'q>>>,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Field<'q> {
    pub scope: Rc<Scope<'q>>,
    pub field_node: FieldRef<'q>,
    pub field_def: &'q schema::Field<'q>,
}

pub(crate) type FieldSet<'q> = Vec<Field<'q>>;
