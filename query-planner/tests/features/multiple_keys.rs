use crate::helpers::plan;
use apollo_query_planner::QueryPlanningOptions;
use insta::assert_snapshot;

#[allow(non_snake_case)]
#[test]
fn multiple_keys_multiple_key_fields() {
    assert_snapshot!(
        plan(
            include_str!("multiple_keys/schema.graphql"),
            r##"
query {
  reviews {
    body
    author {
      name
      risk
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "reviews",
        "variableUsages": [],
        "operation": "{reviews{body author{__typename id}}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "reviews",
          "@",
          "author"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "users",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{name __typename ssn}}}"
        }
      },
      {
        "kind": "Flatten",
        "path": [
          "reviews",
          "@",
          "author"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "actuary",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "ssn"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{risk}}}"
        }
      }
    ]
  }
}"##
    );
}
