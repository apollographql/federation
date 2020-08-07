use crate::context::*;
use crate::helpers::*;
use crate::model::SelectionSet as ModelSelectionSet;
use crate::model::{FetchNode, FlattenNode, GraphQLDocument, PlanNode, QueryPlan};
use crate::model::{ResponsePathElement, Selection as ModelSelection};
use crate::{context, model, QueryPlanError, Result};
use graphql_parser::query::refs::{FieldRef, InlineFragmentRef, SelectionRef, SelectionSetRef};
use graphql_parser::query::*;
use graphql_parser::schema::GraphQLCompositeType;
use graphql_parser::{query, schema, Name};
use linked_hash_map::LinkedHashMap;
use std::collections::HashSet;

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
        possible_types: ifaces_to_implementors(&types),
        variable_name_to_def: variable_name_to_def(query),
        names_to_types: types,
    };

    let is_mutation = context.operation.kind.as_str() == "mutation";

    let root_type = if is_mutation {
        context.get_type("Mutation")
    } else {
        context.get_type("Query")
    };

    let fields = collect_fields(
        &context,
        context.new_scope(root_type, None),
        &context.operation.selection_set,
    );

    let groups = if is_mutation {
        split_root_fields_serially(&context, fields)
    } else {
        split_root_fields(&context, fields)
    };

    let nodes: Vec<PlanNode> = groups
        .into_iter()
        .map(|group| {
            execution_node_for_group(&context, group, Some(GraphQLCompositeType::from(root_type)))
        })
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

fn collect_fields<'q>(
    context: &QueryPlanningContext,
    scope: Scope,
    selection_set: &SelectionSet,
) -> FieldSet<'q> {
    unimplemented!()
}

fn split_root_fields_serially<'q>(
    context: &QueryPlanningContext,
    fields: FieldSet<'q>,
) -> Vec<FetchGroup<'q>> {
    unimplemented!()
}

fn split_root_fields<'q>(context: &QueryPlanningContext, fields: FieldSet) -> Vec<FetchGroup<'q>> {
    unimplemented!()
}

fn split_fields<'q, 's: 'q, F>(
    context: &'q QueryPlanningContext<'q, 's>,
    path: Vec<ResponsePathElement>,
    fields: FieldSet<'q>,
    group_for_field: F,
) where
    F: Fn(&context::Field) -> &'q mut FetchGroup<'q>,
{
    // TODO(ran) FIXME: dedupe this.
    let fields_for_response_names: Vec<FieldSet> = group_by(fields, |f| {
        f.field_node.alias.unwrap_or_else(|| f.field_node.name)
    })
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
            let scope = field.scope;
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
                let group = group_for_field(field);
                complete_field(context, scope, group, path.clone(), fields_for_parent_type)
            } else {
                unimplemented!()
            }
        }
    }
}

fn complete_field<'q, 's: 'q>(
    context: &'q QueryPlanningContext<'q, 's>,
    scope: &'q Scope<'q>,
    parent_group: &'q mut FetchGroup<'q>,
    path: Vec<ResponsePathElement>,
    fields: FieldSet<'q>,
) {
    let field: context::Field = { unimplemented!() };
    parent_group.fields.push(field);
}

fn execution_node_for_group(
    context: &QueryPlanningContext,
    group: FetchGroup,
    parent_type: Option<GraphQLCompositeType>,
) -> PlanNode {
    let FetchGroup {
        service_name,
        fields,
        internal_fragments,
        required_fields,
        provided_fields: _provided_fields,
        dependent_groups_by_service,
        other_dependent_groups,
        merge_at,
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

    let plan_node = if merge_at.is_empty() {
        PlanNode::Flatten(FlattenNode {
            path: merge_at,
            node: Box::new(fetch_node),
        })
    } else {
        fetch_node
    };

    let dependent_groups: Vec<FetchGroup> = dependent_groups_by_service
        .into_iter()
        .map(|(_, v)| v)
        .chain(other_dependent_groups.into_iter())
        .collect();

    if !dependent_groups.is_empty() {
        let dependent_nodes = dependent_groups
            .into_iter()
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

fn selection_set_from_field_set<'q, 's: 'q>(
    fields: FieldSet<'q>,
    parent_type: Option<GraphQLCompositeType>,
    context: &'q QueryPlanningContext<'q, 's>,
) -> SelectionSetRef<'q> {
    fn wrap_in_inline_fragment_if_needed<'q>(
        selections: Vec<SelectionRef<'q>>,
        type_condition: &'q GraphQLCompositeType,
        parent_type: Option<&GraphQLCompositeType>,
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
            let td = context.names_to_types[name];
            td.is_composite_type()
        };

        let context::Field {
            scope: _scope,
            field_node,
            field_def: _field_def,
        } = fields_with_same_reponse_name[0];

        if !is_composite_type || fields_with_same_reponse_name.len() == 1 {
            SelectionRef::Field(field_node)
        } else {
            let field_ref = FieldRef {
                position: pos(),
                alias: field_node.alias,
                name: field_node.name,
                arguments: field_node.arguments.clone(),
                directives: field_node.directives.clone(),
                selection_set: merge_selection_sets(
                    fields_with_same_reponse_name
                        .into_iter()
                        .map(|f| f.field_node)
                        .collect(),
                ),
            };
            SelectionRef::FieldRef(field_ref)
        }
    }

    let mut items: Vec<SelectionRef<'q>> = vec![];

    let fields_by_parent_type = group_by(fields, |f| f.scope.parent_type.name().unwrap());

    for (_, fields_by_parent_type) in fields_by_parent_type {
        let type_condition = &fields_by_parent_type[0].scope.parent_type;

        let fields_by_response_name: LinkedHashMap<&str, FieldSet> =
            group_by(fields_by_parent_type, |f| {
                f.field_node.alias.unwrap_or_else(|| f.field_node.name)
            });

        for sel in wrap_in_inline_fragment_if_needed(
            fields_by_response_name
                .into_iter()
                .map(|(_, fs)| combine_fields(fs, context))
                .collect(),
            type_condition,
            parent_type.as_ref(),
        ) {
            items.push(sel);
        }
    }

    SelectionSetRef {
        span: span(),
        items,
    }
}

fn operation_for_entities_fetch<'q>(
    selection_set: SelectionSetRef<'q>,
    variable_definitions: Vec<&'q VariableDefinition<'q>>,
    internal_fragments: HashSet<&'q FragmentDefinition<'q>>,
) -> GraphQLDocument {
    let vars = vec![String::from("$representations:[_Any!]!")]
        .into_iter()
        .chain(variable_definitions.iter().map(|vd| vd.to_string())) // TODO(ran) FIXME: replace with .minified
        .collect::<Vec<String>>()
        .join(",");

    let frags: String = internal_fragments
        .iter()
        .map(|fd| fd.to_string()) // TODO(ran) FIXME: replace with .minified
        .collect::<Vec<String>>()
        .join("");

    format!("query({}){}{}", vars, selection_set.to_string(), frags) // TODO(ran) FIXME: replace with .minified
}

fn operation_for_root_fetch<'q>(
    selection_set: SelectionSetRef<'q>,
    variable_definitions: Vec<&'q VariableDefinition<'q>>,
    internal_fragments: HashSet<&'q FragmentDefinition<'q>>, // TODO(ran) FIXME: use ordered set
    op_kind: Operation,
) -> GraphQLDocument {
    let vars = if variable_definitions.is_empty() {
        String::from("")
    } else {
        format!(
            "({})",
            variable_definitions
                .iter()
                .map(|vd| vd.to_string()) // TODO(ran) FIXME: replace with .minified
                .collect::<Vec<String>>()
                .join(",")
        )
    };

    let frags: String = internal_fragments
        .iter()
        .map(|fd| fd.to_string()) // TODO(ran) FIXME: replace with .minified
        .collect::<Vec<String>>()
        .join("");

    format!(
        "{}{}{}{}",
        op_kind.as_str(),
        vars,
        selection_set.to_string(), // TODO(ran) FIXME: replace with .minified
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
@key(fields: "id", graph: "bills") 
@key(fields: "id", graph: "accounts")
{
  id: ID!
  sum: Float
  tip: Float
} 

type PasswordAccount @key(fields: "email", graph: "accounts") {
  email: String!
}

type SMSAccount @key(fields: "number", graph: "accounts") {
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
@key(fields: "id", graph: "accounts") {
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
        println!("{:?}", schema);

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
