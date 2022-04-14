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
          "operation": "query GetReviwedBookNames__accounts__0{me{__typename id}}",
          "operationName": "GetReviwedBookNames__accounts__0"
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
            "operation": "query GetReviwedBookNames__reviews__1($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{product{__typename ...on Book{__typename isbn}}}}}}",
            "operationName": "GetReviwedBookNames__reviews__1"
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
            "operation": "query GetReviwedBookNames__books__2($representations:[_Any!]!){_entities(representations:$representations){...on Book{title year}}}",
            "operationName": "GetReviwedBookNames__books__2"
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
            "operation": "query GetReviwedBookNames__product__3($representations:[_Any!]!){_entities(representations:$representations){...on Book{name}}}",
            "operationName": "GetReviwedBookNames__product__3"
          }
        }
      ]
    }
  }

  """
