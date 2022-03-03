Feature: Query Planning > Fragments

# important thing here: fetches to accounts service
Scenario: supports inline fragments (one level)
  Given query
    """
    query GetUser {
      me {
        ... on User {
          username
        }
      }
    }
    """
  Then query plan
    """
    {"kind":"QueryPlan","node":{"kind":"Fetch","serviceName":"accounts","variableUsages":[],"operationKind": "query","operation":"query GetUser_accounts_0{me{username}}","operationName":"GetUser_accounts_0"}}
    """

# important things: calls [accounts, reviews, products, books]
Scenario: supports inline fragments (multi level)
  Given query
  """
  query GetUser {
    me {
      ... on User {
        username
        reviews {
          ... on Review {
            body
            product {
              ... on Product {
                ... on Book {
                  title
                }
                ... on Furniture {
                  name
                }
              }
            }
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
          "operation": "query GetUser_accounts_0{me{__typename id username}}",
          "operationName": "GetUser_accounts_0"
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
            "operation": "query GetUser_reviews_1($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{body product{__typename ...on Book{__typename isbn}...on Furniture{__typename upc}}}}}}",
            "operationName": "GetUser_reviews_1"
          }
        },
        {
          "kind": "Parallel",
          "nodes": [
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
                "operation": "query GetUser_books_2($representations:[_Any!]!){_entities(representations:$representations){...on Book{title}}}",
                "operationName": "GetUser_books_2"
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
                    "typeCondition": "Furniture",
                    "selections": [
                      { "kind": "Field", "name": "__typename" },
                      { "kind": "Field", "name": "upc" }
                    ]
                  }
                ],
                "variableUsages": [],
                "operationKind": "query",
                "operation": "query GetUser_product_3($representations:[_Any!]!){_entities(representations:$representations){...on Furniture{name}}}",
                "operationName": "GetUser_product_3"
              }
            }
          ]
        }
      ]
    }
  }
  """

Scenario: supports named fragments (one level)
  Given query
  """
  query GetUser {
    me {
      ...userDetails
    }
  }

  fragment userDetails on User {
    username
  }
  """
  Then query plan
  """
  {
    "kind": "QueryPlan",
    "node": {
      "kind": "Fetch",
      "serviceName": "accounts",
      "variableUsages": [],
      "operationKind": "query",
      "operation": "query GetUser_accounts_0{me{username}}",
      "operationName": "GetUser_accounts_0"
    }
  }
  """

# important: calls accounts service
Scenario: supports multiple named fragments (one level, mixed ordering)
  Given query
  """
  fragment userInfo on User {
    name {
      first
    }
  }
  query GetUser {
    me {
      ...userDetails
      ...userInfo
    }
  }

  fragment userDetails on User {
    username
  }
  """
  Then query plan
  """
  {
    "kind": "QueryPlan",
    "node": {
      "kind": "Fetch",
      "serviceName": "accounts",
      "variableUsages": [],
      "operationKind": "query",
      "operation": "query GetUser_accounts_0{me{username name{first}}}",
      "operationName": "GetUser_accounts_0"
    }
  }
  """

Scenario: supports multiple named fragments (multi level, mixed ordering)
  Given query
  """
  fragment reviewDetails on Review {
    body
  }
  query GetUser {
    me {
      ...userDetails
    }
  }

  fragment userDetails on User {
    username
    reviews {
      ...reviewDetails
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
          "operation": "query GetUser_accounts_0{me{__typename id username}}",
          "operationName": "GetUser_accounts_0"
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
            "operation": "query GetUser_reviews_1($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{body}}}}",
            "operationName": "GetUser_reviews_1"
          }
        }
      ]
    }
  }
  """

# important: calls accounts & reviews, uses `variableUsages`
Scenario: supports variables within fragments
  Given query
  """
  query GetUser($format: Boolean) {
    me {
      ...userDetails
    }
  }

  fragment userDetails on User {
    username
    reviews {
      body(format: $format)
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
          "operation": "query GetUser_accounts_0{me{__typename id username}}",
          "operationName": "GetUser_accounts_0"
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
            "variableUsages": ["format"],
            "operationKind": "query",
            "operation": "query GetUser_reviews_1($representations:[_Any!]!$format:Boolean){_entities(representations:$representations){...on User{reviews{body(format:$format)}}}}",
            "operationName": "GetUser_reviews_1"
          }
        }
      ]
    }
  }
  """

Scenario: supports root fragments
  Given query
  """
  query GetUser {
    ... on Query {
      me {
        username
      }
    }
  }
  """
  Then query plan
  """
  {
    "kind": "QueryPlan",
    "node": {
      "kind": "Fetch",
      "serviceName": "accounts",
      "variableUsages": [],
      "operationKind": "query",
      "operation": "query GetUser_accounts_0{me{username}}",
      "operationName": "GetUser_accounts_0"
    }
  }
  """

Scenario: supports directives on inline fragments (https://github.com/apollographql/federation/issues/177)
  Given query
  """
  query GetVehicle {
    vehicle(id:"rav4") {
      ... on Car @fragmentDirective {
        price
        thing {
          ... on Ikea {
            asile
          }
        }
      }
      ... on Van {
        price @stream
      }
    }
  }
  """
  Then query plan
  """
  {"kind":"QueryPlan","node":{"kind":"Fetch","serviceName":"product","variableUsages":[],"operationKind": "query","operation":"query GetVehicle_product_0{vehicle(id:\"rav4\"){__typename ...on Car@fragmentDirective{price thing{__typename ...on Ikea{asile}}}...on Van{price@stream}}}","operationName":"GetVehicle_product_0"}}
  """
