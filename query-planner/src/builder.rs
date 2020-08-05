use crate::context::*;
use crate::helpers::*;
use crate::model::{PlanNode, QueryPlan};
use crate::{QueryPlanError, Result};
use graphql_parser::query::*;
use graphql_parser::schema;
use graphql_parser::schema::TypeDefinition;

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
        .map(|group| execution_node_for_group(&context, group, root_type))
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

fn execution_node_for_group(
    context: &QueryPlanningContext,
    group: FetchGroup,
    typ: &TypeDefinition,
) -> PlanNode {
    unimplemented!()
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
