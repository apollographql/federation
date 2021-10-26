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
          "operation": "{me{__typename id}}"
        },
        {
          "kind": "Flatten",
          "path": ["me"],
          "rootEntityFieldNames": ["reviews"],
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
            "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{product{__typename ...on Book{__typename isbn}}}}}}"
          }
        },
        {
          "kind": "Flatten",
          "path": ["me", "reviews", "@", "product"],
          "rootEntityFieldNames": ["__typename", "isbn", "title", "year"],
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
            "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{__typename isbn title year}}}"
          }
        },
        {
          "kind": "Flatten",
          "path": ["me", "reviews", "@", "product"],
          "rootEntityFieldNames": ["name"],
          "node": {
            "kind": "Fetch",
            "serviceName": "product",
            "requires": [
              {
                "kind": "InlineFragment",
                "typeCondition": "Book",
                "selections": [
                  { "kind": "Field", "name": "__typename" },
                  { "kind": "Field", "name": "isbn" },
                  { "kind": "Field", "name": "title" },
                  { "kind": "Field", "name": "year" }
                ]
              }
            ],
            "variableUsages": [],
            "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{name}}}"
          }
        }
      ]
    }
  }

  """
