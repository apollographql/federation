use crate::autofrag::auto_fragmentization;
use crate::consts::{
    typename_field_def, typename_field_node, EMPTY_DIRECTIVES, MUTATION_TYPE_NAME, QUERY_TYPE_NAME,
    TYPENAME_FIELD_NAME,
};
use crate::context::*;
use crate::federation::Federation;
use crate::groups::{
    FetchGroup, GroupForField, GroupForSubField, ParallelGroupForField, SerialGroupForField,
};
use crate::helpers::*;
use crate::model::Selection as ModelSelection;
use crate::model::SelectionSet as ModelSelectionSet;
use crate::model::{FetchNode, FlattenNode, GraphQLDocument, PlanNode, QueryPlan, ResponsePath};
use crate::{context, model, QueryPlanError, QueryPlanner, QueryPlanningOptions, Result};
use graphql_parser::query::refs::{FieldRef, InlineFragmentRef, SelectionRef, SelectionSetRef};
use graphql_parser::query::*;
use graphql_parser::schema::TypeDefinition;
use graphql_parser::{query, schema, DisplayMinified, Name};
use linked_hash_map::LinkedHashMap;
use std::collections::HashSet;
use std::rc::Rc;
use tracing::instrument;

impl<'s> QueryPlanner<'s> {
    #[instrument(skip(self, query, options))]
    pub(crate) fn build_query_plan(
        &self,
        query: &Document,
        options: QueryPlanningOptions,
    ) -> Result<QueryPlan> {
        let schema = &self.schema.document;
        let mut ops = get_operations(&query);

        if ops.is_empty() {
            return Ok(QueryPlan { node: None });
        }

        if ops.len() > 1 {
            return Err(QueryPlanError::InvalidQuery(
                "multiple operations are not supported",
            ));
        }

        if let Operation::Subscription = ops[0].kind {
            return Err(QueryPlanError::InvalidQuery(
                "subscriptions are not supported",
            ));
        }

        let types = names_to_types(schema);

        let federation = Federation::new(&self.schema)?;

        // TODO(ran)(p2)(#114) see if we can optimize and memoize the stuff we build only using the schema.
        let context = QueryPlanningContext {
            schema,
            operation: ops.pop().unwrap(),
            fragments: query
                .definitions
                .iter()
                .filter_map(|d| match d {
                    Definition::Fragment(frag) => Some((frag.name, frag)),
                    _ => None,
                })
                .collect(),
            possible_types: build_possible_types(schema, &types),
            variable_name_to_def: variable_name_to_def(&query),
            federation,
            names_to_types: types,
            options,
        };

        let is_mutation = context.operation.kind.as_str() == "mutation";

        let root_type = if is_mutation {
            context.names_to_types[MUTATION_TYPE_NAME]
        } else {
            context.names_to_types[QUERY_TYPE_NAME]
        };

        let fields = collect_fields(
            &context,
            context.new_scope(root_type, None),
            SelectionSetRef::from(context.operation.selection_set),
        );

        let groups = if is_mutation {
            split_root_fields_serially(&context, fields)
        } else {
            split_root_fields(&context, fields)
        };

        let nodes: Vec<PlanNode> = groups
            .into_iter()
            .map(|group| execution_node_for_group(&context, group, Some(root_type)))
            .collect();

        let node = if nodes.is_empty() {
            None
        } else if is_mutation {
            Some(flat_wrap(NodeCollectionKind::Sequence, nodes))
        } else {
            Some(flat_wrap(NodeCollectionKind::Parallel, nodes))
        };

        Ok(QueryPlan { node })
    }
}

pub(crate) fn collect_fields<'q>(
    context: &'q QueryPlanningContext<'q>,
    scope: Rc<Scope<'q>>,
    selection_set: SelectionSetRef<'q>,
) -> FieldSet<'q> {
    if selection_set.items.is_empty() {
        return vec![];
    }

    macro_rules! collect_inline_fragment {
        ($inline:ident, $selection_set:expr, $context:ident, $scope:ident, $visited_fragment_names:ident, $fields:ident, $directives:expr) => {
            let fragment_condition = $inline
                .type_condition
                .map(|tc| $context.names_to_types[tc])
                .unwrap_or_else(|| $scope.parent_type);
            let new_scope = $context.new_scope_with_directives(
                fragment_condition,
                Some($scope.clone()),
                Some($directives),
            );
            if !new_scope.possible_types.is_empty() {
                collect_fields_rec(
                    $context,
                    new_scope,
                    $selection_set,
                    $visited_fragment_names,
                    $fields,
                )
            }
        };
    }

    fn collect_fields_rec<'a, 'q>(
        context: &'q QueryPlanningContext<'q>,
        scope: Rc<Scope<'q>>,
        selection_set: SelectionSetRef<'q>,
        visited_fragment_names: &'a mut HashSet<&'q str>,
        fields: &'a mut FieldSet<'q>,
    ) {
        let selections_without_introspection = selection_set
            .items
            .into_iter()
            .filter(|s| is_not_introspection_field(s));

        for selection in selections_without_introspection {
            match selection {
                SelectionRef::FieldRef(field) => {
                    let name = field.name;
                    fields.push(context::Field {
                        scope: scope.clone(),
                        field_node: field,
                        field_def: get_field_def_from_type(&scope.parent_type, name),
                    })
                }
                SelectionRef::Field(field) | SelectionRef::Ref(Selection::Field(field)) => fields
                    .push(context::Field {
                        scope: scope.clone(),
                        field_node: field_ref!(field),
                        field_def: get_field_def_from_type(&scope.parent_type, field.name),
                    }),
                SelectionRef::Ref(Selection::InlineFragment(inline)) => {
                    collect_inline_fragment!(
                        inline,
                        SelectionSetRef::from(&inline.selection_set),
                        context,
                        scope,
                        visited_fragment_names,
                        fields,
                        &inline.directives
                    );
                }
                SelectionRef::InlineFragmentRef(inline_ref) => {
                    collect_inline_fragment!(
                        inline_ref,
                        inline_ref.selection_set,
                        context,
                        scope,
                        visited_fragment_names,
                        fields,
                        &inline_ref.directives
                    );
                }
                SelectionRef::Ref(Selection::FragmentSpread(spread)) => {
                    let fragment = context.fragments[spread.fragment_name];
                    if !visited_fragment_names.contains(spread.fragment_name) {
                        let new_scope = context.new_scope(
                            context.names_to_types[fragment.type_condition],
                            Some(scope.clone()),
                        );
                        if !new_scope.possible_types.is_empty() {
                            visited_fragment_names.insert(spread.fragment_name);
                            collect_fields_rec(
                                context,
                                new_scope,
                                SelectionSetRef::from(&fragment.selection_set),
                                visited_fragment_names,
                                fields,
                            );
                        }
                    }
                }
                SelectionRef::FragmentSpreadRef(_) => {
                    unreachable!("FragmentSpreadRef is only used at the end of query planning")
                }
            }
        }
    }

    let mut visited_fragment_names: HashSet<&str> = HashSet::new();
    let mut fields = vec![];
    collect_fields_rec(
        context,
        scope,
        selection_set,
        &mut visited_fragment_names,
        &mut fields,
    );
    fields
}

fn split_root_fields<'q>(
    context: &'q QueryPlanningContext<'q>,
    fields: FieldSet<'q>,
) -> Vec<FetchGroup<'q>> {
    let mut group_for_service = ParallelGroupForField::new(context);

    split_fields(context, vec![], fields, &mut group_for_service);

    group_for_service.into_groups()
}

fn split_root_fields_serially<'q>(
    context: &'q QueryPlanningContext<'q>,
    fields: FieldSet<'q>,
) -> Vec<FetchGroup<'q>> {
    let mut serial_group_for_field = SerialGroupForField::new(context);

    split_fields(context, vec![], fields, &mut serial_group_for_field);

    serial_group_for_field.into_groups()
}

fn split_fields<'a, 'q: 'a>(
    context: &'q QueryPlanningContext<'q>,
    path: ResponsePath,
    fields: FieldSet<'q>,
    grouper: &'a mut dyn GroupForField<'q>,
) {
    let grouped = group_by(fields, |f| f.field_node.response_name());
    let fields_for_response_names: Vec<FieldSet> = values!(grouped);

    for field_for_resposne_name in fields_for_response_names {
        let fields_by_parent_type: LinkedHashMap<&str, FieldSet> =
            group_by(field_for_resposne_name, |f| f.scope.parent_type.as_name());
        for (parent_type, fields_for_parent_type) in fields_by_parent_type {
            let field = &fields_for_parent_type[0];
            let scope = &field.scope;
            let field_def = field.field_def;

            if is_introspection_type(field_def.field_type.as_name())
                || (field_def.name == TYPENAME_FIELD_NAME
                    && (parent_type == QUERY_TYPE_NAME || parent_type == MUTATION_TYPE_NAME))
            {
                continue;
            }

            let can_find_group = matches!(
                context.names_to_types[parent_type],
                schema::TypeDefinition::Object(obj) if scope.possible_types.contains(&obj)
            );

            if can_find_group {
                let group = grouper.group_for_field(scope.parent_type, field_def);
                complete_field(
                    context,
                    scope.clone(),
                    group,
                    path.clone(),
                    fields_for_parent_type,
                )
            } else {
                let has_no_extending_field_defs = scope
                    .possible_types
                    .iter()
                    .map(|runtime_type| get_field_def!(runtime_type, field.field_node.name))
                    .all(|field_def| {
                        context
                            .federation
                            .service_name_for_field(field_def)
                            .is_none()
                    });

                if has_no_extending_field_defs {
                    let group = grouper.group_for_field(scope.parent_type, field_def);
                    complete_field(
                        context,
                        scope.clone(),
                        group,
                        path.clone(),
                        fields_for_parent_type,
                    );
                    continue;
                }

                for runtime_parent_obj_type in scope.possible_types.iter() {
                    let field_def = get_field_def!(runtime_parent_obj_type, field.field_node.name);
                    let new_scope = context.new_scope(
                        context.type_def_for_object(runtime_parent_obj_type),
                        Some(scope.clone()),
                    );
                    let group = grouper.group_for_field(new_scope.parent_type, field_def);

                    let fields_with_runtime_parent_type = fields_for_parent_type
                        .iter()
                        .map(|field| context::Field {
                            scope: field.scope.clone(),
                            field_node: field.field_node.clone(),
                            field_def,
                        })
                        .collect();

                    complete_field(
                        context,
                        new_scope,
                        group,
                        path.clone(),
                        fields_with_runtime_parent_type,
                    );
                }
            }
        }
    }
}

pub(crate) fn get_field_def_from_type<'q>(
    td: &'q TypeDefinition<'q>,
    name: &'q str,
) -> &'q schema::Field<'q> {
    if name == TYPENAME_FIELD_NAME {
        typename_field_def()
    } else {
        match td {
            TypeDefinition::Object(obj) => get_field_def!(obj, name),
            TypeDefinition::Interface(iface) => get_field_def!(iface, name),
            _ => unreachable!(),
        }
    }
}

fn complete_field<'a, 'q: 'a>(
    context: &'q QueryPlanningContext<'q>,
    scope: Rc<Scope<'q>>,
    parent_group: &'a mut FetchGroup<'q>,
    path: ResponsePath,
    fields: FieldSet<'q>,
) {
    let field: context::Field = {
        let type_name = fields[0].field_def.field_type.as_name();
        // the type_name could be a primitive type which is not in our names_to_types map.
        let return_type = context.names_to_types.get(type_name);

        if return_type.is_none() || !return_type.expect("checked not None").is_composite_type() {
            let mut fields = fields;
            context::Field {
                scope,
                ..fields.pop().expect("fields cannot be empty")
            }
        } else {
            let return_type = return_type.expect("Already checked this is not None");
            let (head, tail) = fields.head();

            let field_path = add_path(
                path,
                head.field_node.response_name(),
                &head.field_def.field_type,
            );
            let mut sub_group = FetchGroup::new(
                parent_group.service_name.clone(),
                field_path.clone(),
                context.get_provided_fields(head.field_def, &parent_group.service_name),
            );

            if return_type.is_abstract_type() {
                sub_group.fields.push(context::Field {
                    scope: context.new_scope(return_type, Some(scope.clone())),
                    field_node: typename_field_node(),
                    field_def: typename_field_def(),
                })
            }

            let mut response_field = context::Field {
                scope,
                field_def: head.field_def,
                field_node: field_ref!(head.field_node, SelectionSetRef::default()),
            };

            let fields: FieldSet = vec![head].into_iter().chain(tail).collect();
            let sub_fields = collect_sub_fields(context, return_type, fields);
            let sub_group = split_sub_fields(context, field_path, sub_fields, sub_group);

            let selection_set_ref =
                selection_set_from_field_set(sub_group.fields, Some(return_type), context);

            let mut sub_group_dependent_groups = {
                values!(iter sub_group.dependent_groups_by_service)
                    .chain(sub_group.other_dependent_groups.into_iter())
                    .collect()
            };

            parent_group
                .other_dependent_groups
                .append(&mut sub_group_dependent_groups);

            response_field.field_node.selection_set = selection_set_ref;
            response_field
        }
    };
    parent_group.fields.push(field);
}

fn add_path(mut path: ResponsePath, response_name: &str, typ: &Type) -> ResponsePath {
    path.push(String::from(response_name));
    let mut typ = typ;

    loop {
        match typ {
            Type::NamedType(_) => break,
            Type::ListType(t) => {
                path.push(String::from("@"));
                typ = t.as_ref()
            }
            Type::NonNullType(t) => typ = t.as_ref(),
        }
    }
    path
}

fn collect_sub_fields<'q>(
    context: &'q QueryPlanningContext<'q>,
    return_type: &'q TypeDefinition<'q>,
    fields: FieldSet<'q>,
) -> FieldSet<'q> {
    fields
        .into_iter()
        .flat_map(|field| {
            collect_fields(
                context,
                context.new_scope(return_type, None),
                field.field_node.selection_set,
            )
        })
        .collect()
}

fn split_sub_fields<'q>(
    context: &'q QueryPlanningContext<'q>,
    field_path: ResponsePath,
    sub_fields: FieldSet<'q>,
    parent_group: FetchGroup<'q>,
) -> FetchGroup<'q> {
    let mut grouper = GroupForSubField::new(context, parent_group);
    split_fields(context, field_path, sub_fields, &mut grouper);
    grouper.into_groups().pop().expect("groups cannot be empty")
}

fn execution_node_for_group(
    context: &QueryPlanningContext,
    group: FetchGroup,
    parent_type: Option<&TypeDefinition>,
) -> PlanNode {
    let FetchGroup {
        service_name,
        fields,
        required_fields,
        dependent_groups_by_service,
        other_dependent_groups,
        merge_at,
        ..
    } = group;

    let selection_set = selection_set_from_field_set(fields, parent_type, context);

    let requires = if !required_fields.is_empty() {
        Some(ref_into_model_selection_set(selection_set_from_field_set(
            required_fields,
            None,
            context,
        )))
    } else {
        None
    };

    let (variable_names, variable_defs) = context.get_variable_usages(&selection_set);

    let operation = if requires.is_some() {
        operation_for_entities_fetch(selection_set, variable_defs)
    } else {
        operation_for_root_fetch(
            context,
            selection_set,
            variable_defs,
            context.operation.kind,
        )
    };

    let fetch_node = PlanNode::Fetch(FetchNode {
        service_name,
        variable_usages: variable_names,
        requires,
        operation,
    });

    let plan_node = if !merge_at.is_empty() {
        PlanNode::Flatten(FlattenNode {
            path: merge_at,
            node: Box::new(fetch_node),
        })
    } else {
        fetch_node
    };

    if !dependent_groups_by_service.is_empty() || !other_dependent_groups.is_empty() {
        let dependent_nodes = values!(iter dependent_groups_by_service)
            .chain(other_dependent_groups.into_iter())
            .map(|group| execution_node_for_group(context, group, None))
            .collect();

        flat_wrap(
            NodeCollectionKind::Sequence,
            vec![
                plan_node,
                flat_wrap(NodeCollectionKind::Parallel, dependent_nodes),
            ],
        )
    } else {
        plan_node
    }
}

fn selection_set_from_field_set<'q>(
    fields: FieldSet<'q>,
    parent_type: Option<&'q TypeDefinition<'q>>,
    context: &'q QueryPlanningContext<'q>,
) -> SelectionSetRef<'q> {
    fn wrap_in_inline_fragment_if_needed<'q>(
        selections: Vec<SelectionRef<'q>>,
        type_condition: &'q TypeDefinition<'q>,
        parent_type: Option<&'q TypeDefinition<'q>>,
        directives: Option<&'q Vec<Directive<'q>>>,
    ) -> Vec<SelectionRef<'q>> {
        if parent_type.map(|pt| pt == type_condition).unwrap_or(false) {
            selections
        } else {
            vec![SelectionRef::InlineFragmentRef(InlineFragmentRef {
                position: pos(),
                type_condition: type_condition.name(),
                directives: directives.unwrap_or(&EMPTY_DIRECTIVES),
                selection_set: SelectionSetRef {
                    span: span(),
                    items: selections,
                },
            })]
        }
    }

    fn combine_fields<'q>(
        fields_with_same_reponse_name: FieldSet<'q>,
        context: &'q QueryPlanningContext,
    ) -> SelectionRef<'q> {
        let is_composite_type = {
            let name = fields_with_same_reponse_name[0]
                .field_def
                .field_type
                .as_name();

            // NB: we don't have specified types (i.e. primitives) in our map.
            // They are not composite types.
            context
                .names_to_types
                .get(name)
                .map(|td| td.is_composite_type())
                .unwrap_or(false)
        };

        if !is_composite_type || fields_with_same_reponse_name.len() == 1 {
            let field_ref = fields_with_same_reponse_name
                .into_iter()
                .next()
                .expect("There must be only one field")
                .field_node;
            SelectionRef::FieldRef(field_ref)
        } else {
            let nodes: Vec<FieldRef> = fields_with_same_reponse_name
                .into_iter()
                .map(|f| f.field_node)
                .collect();

            let field_ref = field_ref!(nodes[0], merge_selection_sets(nodes));

            SelectionRef::FieldRef(field_ref)
        }
    }

    let mut items: Vec<SelectionRef<'q>> = vec![];

    let fields_by_parent_type = group_by(fields, |f| f.scope.parent_type.as_name());

    for (_, fields_by_parent_type) in fields_by_parent_type {
        let type_condition = fields_by_parent_type[0].scope.parent_type;
        let directives = fields_by_parent_type[0].scope.scope_directives;

        let fields_by_response_name: LinkedHashMap<&str, FieldSet> =
            group_by(fields_by_parent_type, |f| f.field_node.response_name());

        let selections = wrap_in_inline_fragment_if_needed(
            fields_by_response_name
                .into_iter()
                .map(|(_, fs)| combine_fields(fs, context))
                .collect(),
            type_condition,
            parent_type,
            directives,
        );
        items.extend(selections);
    }

    SelectionSetRef {
        span: span(),
        items,
    }
}

fn operation_for_entities_fetch<'q>(
    selection_set: SelectionSetRef<'q>,
    variable_definitions: Vec<&'q VariableDefinition<'q>>,
) -> GraphQLDocument {
    let vars = vec![String::from("$representations:[_Any!]!")]
        .into_iter()
        .chain(variable_definitions.iter().map(|vd| vd.minified()))
        .collect::<String>();

    format!(
        "query({}){{_entities(representations:$representations){}}}",
        vars,
        selection_set.minified(),
    )
}

fn operation_for_root_fetch<'q>(
    context: &'q QueryPlanningContext<'q>,
    selection_set: SelectionSetRef<'q>,
    variable_definitions: Vec<&'q VariableDefinition<'q>>,
    op_kind: Operation,
) -> GraphQLDocument {
    let vars = if variable_definitions.is_empty() {
        String::from("")
    } else {
        format!(
            "({})",
            variable_definitions
                .iter()
                .map(|vd| vd.minified())
                .collect::<String>()
        )
    };

    let (frags, selection_set) = maybe_auto_fragmentization(context, selection_set);

    let op_kind = match op_kind {
        Operation::Query if vars.is_empty() => "",
        _ => op_kind.as_str(),
    };

    format!("{}{}{}{}", op_kind, vars, selection_set, frags)
}

fn field_into_model_selection(field: &query::Field) -> ModelSelection {
    ModelSelection::Field(model::Field {
        alias: field.alias.map(String::from),
        name: String::from(field.name),
        selections: if field.selection_set.items.is_empty() {
            None
        } else {
            Some(into_model_selection_set(&field.selection_set))
        },
    })
}

fn into_model_selection(sel: &Selection) -> ModelSelection {
    match sel {
        Selection::Field(field) => field_into_model_selection(field),
        Selection::InlineFragment(inline) => {
            ModelSelection::InlineFragment(model::InlineFragment {
                type_condition: inline.type_condition.map(String::from),
                selections: into_model_selection_set(&inline.selection_set),
            })
        }
        Selection::FragmentSpread(_) => unreachable!(
            "the current query planner doesn't seem to support these in the resulting query plan"
        ),
    }
}

fn ref_into_model_selection_set(selection_set_ref: SelectionSetRef) -> ModelSelectionSet {
    fn ref_into_model_selection(sel_ref: SelectionRef) -> ModelSelection {
        match sel_ref {
            SelectionRef::Ref(sel) => into_model_selection(sel),
            SelectionRef::Field(field) => field_into_model_selection(field),
            SelectionRef::FieldRef(field) => ModelSelection::Field(model::Field {
                alias: field.alias.map(String::from),
                name: String::from(field.name),
                selections: if field.selection_set.items.is_empty() {
                    None
                } else {
                    Some(ref_into_model_selection_set(field.selection_set))
                },
            }),
            SelectionRef::InlineFragmentRef(inline) => {
                ModelSelection::InlineFragment(model::InlineFragment {
                    type_condition: inline.type_condition.map(String::from),
                    selections: ref_into_model_selection_set(inline.selection_set),
                })
            }
            SelectionRef::FragmentSpreadRef(_) => {
                unreachable!("FragmentSpreadRef is only used at the end of query planning")
            }
        }
    }

    selection_set_ref
        .items
        .into_iter()
        .map(ref_into_model_selection)
        .collect()
}

fn into_model_selection_set(selection_set: &SelectionSet) -> ModelSelectionSet {
    selection_set
        .items
        .iter()
        .map(into_model_selection)
        .collect()
}

fn flat_wrap(kind: NodeCollectionKind, mut nodes: Vec<PlanNode>) -> PlanNode {
    if nodes.is_empty() {
        panic!("programming error: should always be called with nodes")
    }

    if nodes.len() == 1 {
        nodes.pop().expect("nodes length is 1")
    } else {
        let nodes = nodes
            .into_iter()
            .flat_map(|n| match n {
                PlanNode::Sequence { nodes } if matches!(kind, NodeCollectionKind::Sequence) => {
                    nodes
                }
                PlanNode::Parallel { nodes } if matches!(kind, NodeCollectionKind::Parallel) => {
                    nodes
                }
                n => vec![n],
            })
            .collect();

        match kind {
            NodeCollectionKind::Sequence => PlanNode::Sequence { nodes },
            NodeCollectionKind::Parallel => PlanNode::Parallel { nodes },
        }
    }
}

fn maybe_auto_fragmentization<'q>(
    context: &'q QueryPlanningContext<'q>,
    selection_set: SelectionSetRef<'q>,
) -> (String, String) {
    if context.options.auto_fragmentization {
        let (frags, selection_set) = auto_fragmentization(context, selection_set);
        let frags = frags
            .into_iter()
            .map(|fd| fd.minified())
            .collect::<String>();
        (frags, selection_set.minified())
    } else {
        (String::from(""), selection_set.minified())
    }
}
