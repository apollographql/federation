use std::collections::HashMap;

use graphql_parser::query::*;
use graphql_parser::schema;

use crate::model::QueryPlan;
use crate::visitor::QueryVisitor;
use crate::{QueryPlanError, Result};

pub(crate) fn build_query_plan(schema: &schema::Document, query: &Document) -> Result<QueryPlan> {
    // TODO(ran) FIXME: a Definition could be a SelectionSet which is techinically valid,
    //  but this code for now doesn't handle them.
    let operations = get_operations(query);

    if operations.is_empty() {
        return Ok(QueryPlan { node: None });
    }

    if operations.len() > 1 {
        return Err(QueryPlanError::InvalidQuery(
            "multiple operations are not supported",
        ));
    }

    // TODO(ran) FIXME: we can validate this before calling `build_query_plan`
    if let Operation::Subscription = operations[0].kind {
        return Err(QueryPlanError::InvalidQuery(
            "subscriptions are not supported",
        ));
    }

    let mut visitor = QueryVisitor::new(schema, query);
    query.accept(&mut visitor);

    let is_query = match operations[0].kind {
        Operation::Query => true,
        Operation::Mutation => false,
        _ => panic!("already verified this op is not a subscription"),
    };

    Ok(visitor.into_query_plan(is_query))
}

fn get_operations<'q>(query: &'q Document<'q>) -> Vec<&'q OperationDefinition<'q>> {
    // TODO(ran) FIXME: If there's a SelectionSet instead of an Operation, we need to handle it.
    query
        .definitions
        .iter()
        .flat_map(|d| match d {
            Definition::Operation(op) => Some(op),
            _ => None,
        })
        .collect()
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
  @composedGraph(version: 1)
{
  query: Query
  mutation: Mutation
}

type Query {
  user(id: ID!): User @resolve(graph: "accounts")
  me: User @resolve(graph: "accounts")
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
    #[should_panic]
    fn simple_case_attempt_1() {
        let query = parse_query("query { me { name } }").unwrap();
        let schema = parse_schema(schema()).unwrap();
        println!("{:?}", query);
        println!("{:?}", schema);

        let result = build_query_plan(&schema, &query).unwrap();
        let expected = QueryPlan {
            node: Some(PlanNode::Fetch(FetchNode {
                service_name: String::from("accounts"),
                variable_usages: vec![],
                operation: String::from("{me{name}}"),
                requires: None,
            })),
        };
        assert_eq!(result, expected);
    }
}
