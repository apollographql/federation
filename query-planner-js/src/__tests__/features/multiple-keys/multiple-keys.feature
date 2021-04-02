Feature: Query Planning > Multiple keys

  Scenario: Multiple @key fields
    Given query
      """
        query {
          reviews {
            body
            author {
              name
              risk
            }
          }
        }
      """
    Then query plan
      """
      {
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
              "path": ["reviews", "@", "author"],
              "node": {
                "kind": "Fetch",
                "serviceName": "users",
                "requires": [
                  {
                    "kind": "InlineFragment",
                    "typeCondition": "User",
                    "selections": [
                      { "kind": "Field", "name": "__typename" },
                      { "kind": "Field", "name": "id" }
                    ]
                  }
                ],
                "variableUsages": [],
                "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{name __typename ssn}}}"
              }
            },
            {
              "kind": "Flatten",
              "path": ["reviews", "@", "author"],
              "node": {
                "kind": "Fetch",
                "serviceName": "actuary",
                "requires": [
                  {
                    "kind": "InlineFragment",
                    "typeCondition": "User",
                    "selections": [
                      { "kind": "Field", "name": "__typename" },
                      { "kind": "Field", "name": "ssn" }
                    ]
                  }
                ],
                "variableUsages": [],
                "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{risk}}}"
              }
            }
          ]
        }
      }
      """
