Feature: Query Planning > requires

# requires { isbn, title, year } from books service
Scenario: supports passing additional fields defined by a requires
  Given query
  """
  query GetReviwedBookNames {
    me {
      reviews {
        product {
          ... on Book {
            name
          }
        }
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
          "serviceName": "accounts",
          "variableUsages": [],
          "operationKind": "query",
          "operation": "{me{__typename id}}"
        },
        {
          "kind": "Flatten",
          "path": ["me"],
          "node": {
            "kind": "Fetch",
            "serviceName": "reviews",
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
            "operationKind": "query",
            "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{product{__typename ...on Book{__typename isbn}}}}}}"
          }
        },
        {
          "kind": "Flatten",
          "path": ["me", "reviews", "@", "product"],
          "node": {
            "kind": "Fetch",
            "serviceName": "books",
            "requires": [
              {
                "kind": "InlineFragment",
                "typeCondition": "Book",
                "selections": [
                  { "kind": "Field", "name": "__typename" },
                  { "kind": "Field", "name": "isbn" }
                ]
              }
            ],
            "variableUsages": [],
            "operationKind": "query",
            "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{title year}}}"
          }
        },
        {
          "kind": "Flatten",
          "path": ["me", "reviews", "@", "product"],
          "node": {
            "kind": "Fetch",
            "serviceName": "product",
            "requires": [
              {
                "kind": "InlineFragment",
                "typeCondition": "Book",
                "selections": [
                  { "kind": "Field", "name": "__typename" },
                  { "kind": "Field", "name": "title" },
                  { "kind": "Field", "name": "year" },
                  { "kind": "Field", "name": "isbn" }
                ]
              }
            ],
            "variableUsages": [],
            "operationKind": "query",
            "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{name}}}"
          }
        }
      ]
    }
  }

  """
