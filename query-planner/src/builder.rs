use crate::consts;
use crate::context::*;
use crate::federation::Federation;
use crate::groups::{
    FetchGroup, GroupForField, GroupForSubField, ParallelGroupForField, SerialGroupForField,
};
use crate::helpers::*;
use crate::model::SelectionSet as ModelSelectionSet;
use crate::model::{FetchNode, FlattenNode, GraphQLDocument, PlanNode, QueryPlan};
use crate::model::{ResponsePathElement, Selection as ModelSelection};
use crate::{context, model, QueryPlanError, Result};
use graphql_parser::query::refs::{FieldRef, InlineFragmentRef, SelectionRef, SelectionSetRef};
use graphql_parser::query::*;
use graphql_parser::schema::TypeDefinition;
use graphql_parser::{query, schema, Name};
use linked_hash_map::LinkedHashMap;
use std::collections::HashSet;
use std::rc::Rc;

pub(crate) fn build_query_plan(schema: &schema::Document, query: &Document) -> Result<QueryPlan> {
    let mut ops = get_operations(query);

    if ops.is_empty() {
        return Ok(QueryPlan { node: None });
    }

    if ops.len() > 1 {
        return Err(QueryPlanError::InvalidQuery(
            "multiple operations are not supported",
        ));
    }

    // TODO(ran) FIXME: we can validate this before calling `build_query_plan`
    if let Operation::Subscription = ops[0].kind {
        return Err(QueryPlanError::InvalidQuery(
            "subscriptions are not supported",
        ));
    }

    let types = names_to_types(schema);

    // TODO(ran) FIXME: see if we can optimize and memoize the stuff we build only using the schema.
    let context = QueryPlanningContext {
        schema,
        operation: ops.pop().unwrap(),
        fragments: query
            .definitions
            .iter()
            .flat_map(|d| match d {
                Definition::Fragment(frag) => Some((frag.name, frag)),
                _ => None,
            })
            .collect(),
        auto_fragmentization: false,
        possible_types: build_possible_types(&types),
        variable_name_to_def: variable_name_to_def(query),
        federation: Federation::new(schema),
        names_to_types: types,
    };

    let is_mutation = context.operation.kind.as_str() == "mutation";

    let root_type = if is_mutation {
        context.names_to_types["Mutation"]
    } else {
        context.names_to_types["Query"]
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

    if nodes.is_empty() {
        Ok(QueryPlan { node: None })
    } else if is_mutation {
        Ok(QueryPlan {
            node: Some(PlanNode::Sequence { nodes }),
        })
    } else {
        Ok(QueryPlan {
            node: Some(PlanNode::Parallel { nodes }),
        })
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
        ($inline:ident, $selection_set:expr, $context:ident, $scope:ident, $stack:ident) => {
            let fragment_condition = $inline
                .type_condition
                .map(|tc| $context.names_to_types[tc])
                .unwrap_or_else(|| $scope.parent_type);
            let new_scope = $context.new_scope(fragment_condition, Some(Rc::clone(&$scope)));
            if !new_scope.possible_types.is_empty() {
                $stack.push(Args {
                    scope: new_scope,
                    selection_set: $selection_set,
                });
            }
        };
    }

    // TODO(ran) FIXME: can we try this again with a recursion now that we've resolved some other lifetime stuff.
    struct Args<'q> {
        scope: Rc<Scope<'q>>,
        selection_set: SelectionSetRef<'q>,
    }

    ///// implementation starts here //////

    let mut stack: Vec<Args> = vec![Args {
        scope,
        selection_set,
    }];

    let mut visited_fragment_names = HashSet::new();
    let mut fields = vec![];

    while !stack.is_empty() {
        let Args {
            scope,
            selection_set,
        } = stack.pop().unwrap();

        for selection in selection_set.items.into_iter() {
            match selection {
                SelectionRef::FieldRef(field) => {
                    let name = field.name;
                    fields.push(context::Field {
                        scope: Rc::clone(&scope),
                        field_node: field,
                        field_def: get_field_def_from_type(&scope.parent_type, name),
                    })
                }
                SelectionRef::Field(field) | SelectionRef::Ref(Selection::Field(field)) => fields
                    .push(context::Field {
                        scope: Rc::clone(&scope),
                        field_node: FieldRef::from(field),
                        field_def: get_field_def_from_type(&scope.parent_type, field.name),
                    }),
                SelectionRef::Ref(Selection::InlineFragment(inline)) => {
                    collect_inline_fragment!(
                        inline,
                        SelectionSetRef::from(&inline.selection_set),
                        context,
                        scope,
                        stack
                    );
                }
                SelectionRef::InlineFragmentRef(inline_ref) => {
                    collect_inline_fragment!(
                        inline_ref,
                        inline_ref.selection_set,
                        context,
                        scope,
                        stack
                    );
                }
                SelectionRef::Ref(Selection::FragmentSpread(spread)) => {
                    let fragment = context.fragments[spread.fragment_name];
                    let new_scope = context.new_scope(
                        context.names_to_types[fragment.type_condition],
                        Some(Rc::clone(&scope)),
                    );
                    if !new_scope.possible_types.is_empty()
                        && !visited_fragment_names.contains(spread.fragment_name)
                    {
                        visited_fragment_names.insert(spread.fragment_name);
                        stack.push(Args {
                            scope: new_scope,
                            selection_set: SelectionSetRef::from(&fragment.selection_set),
                        });
                    }
                }
            }
        }
    }

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
    path: Vec<ResponsePathElement>,
    fields: FieldSet<'q>,
    grouper: &'a mut dyn GroupForField<'q>,
) {
    // TODO(ran) FIXME: dedupe this.
    let fields_for_response_names: Vec<FieldSet> =
        group_by(fields, |f| f.field_node.response_name())
            .into_iter()
            .map(|(_, v)| v)
            .collect();

    for field_for_resposne_name in fields_for_response_names {
        let fields_by_parent_type: LinkedHashMap<&str, FieldSet> =
            group_by(field_for_resposne_name, |f| {
                f.scope.parent_type.name().unwrap()
            });
        for (parent_type, fields_for_parent_type) in fields_by_parent_type {
            let field = &fields_for_parent_type[0];
            let scope = &field.scope;
            let field_def = field.field_def;

            if is_introspection_type(field_def.field_type.name().unwrap())
                || (field_def.name == "__typename"
                    && (parent_type == "Query" || parent_type == "Mutation"))
            {
                continue;
            }

            let can_find_group = match context.names_to_types[parent_type] {
                schema::TypeDefinition::Object(obj) if scope.possible_types.contains(&obj) => true,
                _ => false,
            };

            if can_find_group {
                let group = grouper.group_for_field(scope.parent_type, field_def);
                complete_field(
                    context,
                    Rc::clone(scope),
                    group,
                    path.clone(),
                    fields_for_parent_type,
                )
            } else {
                let has_no_extending_field_defs = scope
                    .possible_types
                    .iter()
                    .map(|runtime_type| get_field_def!(runtime_type, field.field_node.name))
                    .all(
                        // TODO(ran) FIXME: this is kind of janky. Change.
                        |field_def| {
                            context
                                .federation
                                .service_name_for_field(field_def)
                                .is_none()
                        },
                    );

                if has_no_extending_field_defs {
                    let group = grouper.group_for_field(scope.parent_type, field_def);
                    // TODO(ran) FIXME: in .ts this is using fieldsForResponseName, seems wrong.
                    complete_field(
                        context,
                        Rc::clone(scope),
                        group,
                        path.clone(),
                        fields_for_parent_type,
                    );
                    continue;
                }

                // TODO(ran) FIXME: the .ts code creates a map and keys by group,
                //  which implies some kind of group equality of some sort.
                //  we need to ensure that our closure of `group_for_field` (in all calls) returns
                //  the "same" group under the same conditions that the .ts code considers equal.

                for runtime_parent_type in &scope.possible_types {
                    let runtime_parent_obj_type = *runtime_parent_type;
                    let field_def = get_field_def!(runtime_parent_obj_type, field.field_node.name);
                    let parent_type_def = context.type_def_for_object(runtime_parent_obj_type);
                    let new_scope = context.new_scope(parent_type_def, Some(Rc::clone(scope)));
                    let group = grouper.group_for_field(new_scope.parent_type, field_def);

                    let fields_with_runtime_parent_type = fields_for_parent_type
                        .iter()
                        .map(|field| context::Field {
                            scope: Rc::clone(&field.scope),
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

fn get_field_def_from_type<'q>(td: &'q TypeDefinition<'q>, name: &'q str) -> &'q schema::Field<'q> {
    match td {
        TypeDefinition::Object(obj) => get_field_def!(obj, name),
        TypeDefinition::Interface(iface) => get_field_def!(iface, name),
        _ => unreachable!(),
    }
}

fn complete_field<'a, 'q: 'a>(
    context: &'q QueryPlanningContext<'q>,
    scope: Rc<Scope<'q>>,
    parent_group: &'a mut FetchGroup<'q>,
    path: Vec<ResponsePathElement>,
    fields: FieldSet<'q>,
) {
    let field: context::Field = {
        let type_name = fields[0].field_def.field_type.name().unwrap();
        // the type_name could be a primitive type which is not in our names_to_types map.
        let return_type = context.names_to_types.get(type_name);

        if return_type.is_none() || !return_type.unwrap().is_composite_type() {
            let mut fields = fields;
            context::Field {
                scope,
                ..fields.pop().unwrap()
            }
        } else {
            let return_type = return_type.unwrap();
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
                    scope: context.new_scope(return_type, Some(scope)),
                    field_node: (*consts::TYPENAME_QUERY_FIELD).clone(),
                    field_def: &*consts::TYPENAME_SCHEMA_FIELD,
                })
            }

            let mut response_field = context::Field {
                scope: Rc::clone(&head.scope),
                field_def: head.field_def,
                field_node: FieldRef {
                    position: pos(),
                    alias: head.field_node.alias,
                    name: head.field_node.name,
                    arguments: head.field_node.arguments.clone(),
                    directives: head.field_node.directives.clone(),
                    selection_set: SelectionSetRef::default(),
                },
            };

            let fields: FieldSet = vec![head].into_iter().chain(tail).collect();
            let sub_fields = collect_sub_fields(context, return_type, fields);
            let sub_group = split_sub_fields(context, field_path, sub_fields, sub_group);

            let sub_group_fields_length = sub_group.fields.len();
            let sub_group_fields = sub_group.fields;
            let selection_set_ref =
                selection_set_from_field_set(sub_group_fields, Some(return_type), context);

            if context.auto_fragmentization && sub_group_fields_length > 2 {
                unimplemented!()
            }

            for (name, sg_internal_fragment) in sub_group.internal_fragments {
                parent_group
                    .internal_fragments
                    .insert(name, sg_internal_fragment);
            }

            let mut sub_group_dependent_groups = {
                sub_group
                    .dependent_groups_by_service
                    .into_iter()
                    .map(|(_, v)| v)
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

fn add_path(
    mut path: Vec<ResponsePathElement>,
    response_name: &str,
    typ: &Type,
) -> Vec<ResponsePathElement> {
    path.push(ResponsePathElement::Field(String::from(response_name)));
    let mut typ = typ;

    loop {
        match typ {
            Type::NamedType(_) => break,
            Type::ListType(t) => {
                path.push(ResponsePathElement::Field(String::from("@")));
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
    field_path: Vec<ResponsePathElement>, // TODO(ran) FIXME: alias this type
    sub_fields: FieldSet<'q>,
    parent_group: FetchGroup<'q>,
) -> FetchGroup<'q> {
    let mut grouper = GroupForSubField::new(context, parent_group);
    split_fields(context, field_path, sub_fields, &mut grouper);
    grouper.into_groups().pop().unwrap()
}

fn execution_node_for_group(
    context: &QueryPlanningContext,
    group: FetchGroup,
    parent_type: Option<&TypeDefinition>,
) -> PlanNode {
    let FetchGroup {
        service_name,
        fields,
        internal_fragments,
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

    let internal_fragments = internal_fragments.owned_values();

    let (variable_names, variable_defs) =
        context.get_variable_usages(&selection_set, &internal_fragments);

    let operation = if requires.is_some() {
        operation_for_entities_fetch(selection_set, variable_defs, internal_fragments)
    } else {
        operation_for_root_fetch(
            selection_set,
            variable_defs,
            internal_fragments,
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

    if !dependent_groups_by_service.is_empty() {
        let dependent_nodes = dependent_groups_by_service
            .into_iter()
            .map(|(_, v)| v)
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
    ) -> Vec<SelectionRef<'q>> {
        if parent_type.map(|pt| pt == type_condition).unwrap_or(false) {
            selections
        } else {
            vec![SelectionRef::InlineFragmentRef(InlineFragmentRef {
                position: pos(),
                type_condition: type_condition.name(),
                directives: vec![],
                selection_set: SelectionSetRef {
                    span: span(),
                    items: selections,
                },
            })]
        }
    }

    fn combine_fields<'q>(
        fields_with_same_reponse_name: Vec<context::Field<'q>>,
        context: &'q QueryPlanningContext,
    ) -> SelectionRef<'q> {
        let is_composite_type = {
            let name = fields_with_same_reponse_name[0]
                .field_def
                .field_type
                .name()
                .unwrap();

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
                .unwrap()
                .field_node;
            SelectionRef::FieldRef(field_ref)
        } else {
            let nodes: Vec<FieldRef> = fields_with_same_reponse_name
                .into_iter()
                .map(|f| f.field_node)
                .collect();

            let fr = nodes[0].clone();

            let field_ref = FieldRef {
                selection_set: merge_selection_sets(nodes),
                ..fr
            };

            SelectionRef::FieldRef(field_ref)
        }
    }

    let mut items: Vec<SelectionRef<'q>> = vec![];

    let fields_by_parent_type = group_by(fields, |f| f.scope.parent_type.name().unwrap());

    for (_, fields_by_parent_type) in fields_by_parent_type {
        let type_condition = fields_by_parent_type[0].scope.parent_type;

        let fields_by_response_name: LinkedHashMap<&str, FieldSet> =
            group_by(fields_by_parent_type, |f| f.field_node.response_name());

        for sel in wrap_in_inline_fragment_if_needed(
            fields_by_response_name
                .into_iter()
                .map(|(_, fs)| combine_fields(fs, context))
                .collect(),
            type_condition,
            parent_type,
        ) {
            items.push(sel);
        }
    }

    SelectionSetRef {
        span: span(),
        items,
    }
}

// TODO(ran) FIXME: replace all relevant .to_string with .minified
fn operation_for_entities_fetch<'q>(
    selection_set: SelectionSetRef<'q>,
    variable_definitions: Vec<&'q VariableDefinition<'q>>,
    internal_fragments: Vec<&'q FragmentDefinition<'q>>,
) -> GraphQLDocument {
    let vars = vec![String::from("$representations:[_Any!]!")]
        .into_iter()
        .chain(variable_definitions.iter().map(|vd| vd.to_string()))
        .collect::<Vec<String>>()
        .join(",");

    let frags: String = internal_fragments
        .iter()
        .map(|fd| fd.to_string())
        .collect::<Vec<String>>()
        .join("");

    format!(
        "query({}){{_entities(representations:$representations){}}}{}",
        vars,
        selection_set.to_string(),
        frags
    )
}

fn operation_for_root_fetch<'q>(
    selection_set: SelectionSetRef<'q>,
    variable_definitions: Vec<&'q VariableDefinition<'q>>,
    internal_fragments: Vec<&'q FragmentDefinition<'q>>,
    op_kind: Operation,
) -> GraphQLDocument {
    let vars = if variable_definitions.is_empty() {
        String::from("")
    } else {
        format!(
            "({})",
            variable_definitions
                .iter()
                .map(|vd| vd.to_string())
                .collect::<Vec<String>>()
                .join(",")
        )
    };

    let frags: String = internal_fragments
        .iter()
        .map(|fd| fd.to_string())
        .collect::<Vec<String>>()
        .join("");

    format!(
        "{}{}{}{}",
        op_kind.as_str(),
        vars,
        selection_set.to_string(),
        frags
    )
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
        nodes.pop().unwrap()
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

#[cfg(test)]
mod tests {
    use graphql_parser::{parse_query, parse_schema};

    use crate::builder::build_query_plan;
    use crate::model::{FetchNode, PlanNode, QueryPlan};

    fn schema() -> &'static str {
        r#"
schema
  @graph(name: "accounts", endpointUrl: "https://accounts.api.com")
  @graph(name: "bills", endpointUrl: "https://bills.api.com")
  @composedGraph(version: 1)
{
  query: Query
  mutation: Mutation
}

type Query {
  user(id: ID!): User @resolve(graph: "accounts")
  me: User @resolve(graph: "accounts")
  bill: Bill @resolve(graph: "bills")
}

type Bill 
@owner(graph: "bills")
@key(fields: "{id}", graph: "bills") 
@key(fields: "{id}", graph: "accounts")
{
  id: ID!
  sum: Float
  tip: Float
} 

type PasswordAccount @key(fields: "{email}", graph: "accounts") {
  email: String!
}

type SMSAccount @key(fields: "{number}", graph: "accounts") {
  number: String
}

union AccountType = PasswordAccount | SMSAccount

type UserMetadata {
  name: String
  address: String
  description: String
}

type User
@owner(graph: "accounts")
@key(fields: "{id}", graph: "accounts") {
  id: ID!
  name: String
  bill: Bill @resolve(graph: "bills")
  username: String
  birthDate(locale: String): String
  account: AccountType
  metadata: [UserMetadata]
}

type Mutation {
  login(username: String!, password: String!): User
}"#
    }

    #[test]
    // #[should_panic]
    fn simple_case_attempt_1() {
        let query = parse_query("query { me { name id } bill { sum } }").unwrap();
        let schema = parse_schema(schema()).unwrap();

        let result = build_query_plan(&schema, &query).unwrap();
        let expected = QueryPlan {
            node: Some(PlanNode::Parallel {
                nodes: vec![
                    PlanNode::Fetch(FetchNode {
                        service_name: String::from("accounts"),
                        variable_usages: vec![],
                        operation: String::from("{me{name id}}"),
                        requires: None,
                    }),
                    PlanNode::Fetch(FetchNode {
                        service_name: String::from("bills"),
                        variable_usages: vec![],
                        operation: String::from("{bill{sum}}"),
                        requires: None,
                    }),
                ],
            }),
        };
        assert_eq!(result, expected);
    }
}
