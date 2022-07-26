Feature: Query Planner > Abstract Types

Scenario: handles an abstract type from the base service
  Given query
  """
  query GetProduct($upc: String!) {
    product(upc: $upc) {
      upc
      name
      price
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
          "serviceName": "product",
          "variableUsages": ["upc"],
          "operationKind": "query",
          "operation": "query GetProduct__product__0($upc:String!){product(upc:$upc){__typename upc ...on Book{__typename isbn}...on Furniture{name}price}}",
          "operationName": "GetProduct__product__0"
        },
        {
          "kind": "Flatten",
          "path": ["product"],
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
            "operation": "query GetProduct__books__1($representations:[_Any!]!){_entities(representations:$representations){...on Book{title year}}}",
            "operationName": "GetProduct__books__1"
          }
        },
        {
          "kind": "Flatten",
          "path": ["product"],
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
            "operation": "query GetProduct__product__2($representations:[_Any!]!){_entities(representations:$representations){...on Book{name}}}",
            "operationName": "GetProduct__product__2"
          }
        }
      ]
    }
  }
  """

Scenario: can request fields on extended interfaces
  Given query
  """
  query GetProduct($upc: String!) {
    product(upc: $upc) {
      inStock
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
          "serviceName": "product",
          "variableUsages": ["upc"],
          "operationKind": "query",
          "operation": "query GetProduct__product__0($upc:String!){product(upc:$upc){__typename ...on Book{__typename isbn}...on Furniture{__typename sku}}}",
          "operationName": "GetProduct__product__0"
        },
        {
          "kind": "Flatten",
          "path": ["product"],
          "node": {
            "kind": "Fetch",
            "serviceName": "inventory",
            "requires": [
              {
                "kind": "InlineFragment",
                "typeCondition": "Book",
                "selections": [
                  { "kind": "Field", "name": "__typename" },
                  { "kind": "Field", "name": "isbn" }
                ]
              },
              {
                "kind": "InlineFragment",
                "typeCondition": "Furniture",
                "selections": [
                  { "kind": "Field", "name": "__typename" },
                  { "kind": "Field", "name": "sku" }
                ]
              }
            ],
            "variableUsages": [],
            "operationKind": "query",
            "operation": "query GetProduct__inventory__1($representations:[_Any!]!){_entities(representations:$representations){...on Book{inStock}...on Furniture{inStock}}}",
            "operationName": "GetProduct__inventory__1"
          }
        }
      ]
    }
  }
  """

Scenario: can request fields on extended types that implement an interface
  Given query
  """
  query GetProduct($upc: String!) {
    product(upc: $upc) {
      inStock
      ... on Furniture {
        isHeavy
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
          "serviceName": "product",
          "variableUsages": ["upc"],
          "operationKind": "query",
          "operation": "query GetProduct__product__0($upc:String!){product(upc:$upc){__typename ...on Book{__typename isbn}...on Furniture{__typename sku}}}",
          "operationName": "GetProduct__product__0"
        },
        {
          "kind": "Flatten",
          "path": ["product"],
          "node": {
            "kind": "Fetch",
            "serviceName": "inventory",
            "requires": [
              {
                "kind": "InlineFragment",
                "typeCondition": "Book",
                "selections": [
                  { "kind": "Field", "name": "__typename" },
                  { "kind": "Field", "name": "isbn" }
                ]
              },
              {
                "kind": "InlineFragment",
                "typeCondition": "Furniture",
                "selections": [
                  { "kind": "Field", "name": "__typename" },
                  { "kind": "Field", "name": "sku" }
                ]
              }
            ],
            "variableUsages": [],
            "operationKind": "query",
            "operation": "query GetProduct__inventory__1($representations:[_Any!]!){_entities(representations:$representations){...on Book{inStock}...on Furniture{inStock isHeavy}}}",
            "operationName": "GetProduct__inventory__1"
          }
        }
      ]
    }
  }
  """

Scenario: prunes unfilled type conditions
  Given query
  """
  query GetProduct($upc: String!) {
    product(upc: $upc) {
      inStock
      ... on Furniture {
        isHeavy
      }
      ... on Book {
        isCheckedOut
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
          "serviceName": "product",
          "variableUsages": ["upc"],
          "operationKind": "query",
          "operation": "query GetProduct__product__0($upc:String!){product(upc:$upc){__typename ...on Book{__typename isbn}...on Furniture{__typename sku}}}",
          "operationName": "GetProduct__product__0"
        },
        {
          "kind": "Flatten",
          "path": ["product"],
          "node": {
            "kind": "Fetch",
            "serviceName": "inventory",
            "requires": [
              {
                "kind": "InlineFragment",
                "typeCondition": "Book",
                "selections": [
                  { "kind": "Field", "name": "__typename" },
                  { "kind": "Field", "name": "isbn" }
                ]
              },
              {
                "kind": "InlineFragment",
                "typeCondition": "Furniture",
                "selections": [
                  { "kind": "Field", "name": "__typename" },
                  { "kind": "Field", "name": "sku" }
                ]
              }
            ],
            "variableUsages": [],
            "operationKind": "query",
            "operation": "query GetProduct__inventory__1($representations:[_Any!]!){_entities(representations:$representations){...on Book{inStock isCheckedOut}...on Furniture{inStock isHeavy}}}",
            "operationName": "GetProduct__inventory__1"
          }
        }
      ]
    }
  }
  """

Scenario: fetches interfaces returned from other services
  Given query
  """
  query GetUserAndProducts {
    me {
      reviews {
        product {
          price
          ... on Book {
            title
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
          "operation": "query GetUserAndProducts__accounts__0{me{__typename id}}",
          "operationName": "GetUserAndProducts__accounts__0"
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
            "operation": "query GetUserAndProducts__reviews__1($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{product{__typename ...on Book{__typename isbn}...on Furniture{__typename upc}}}}}}",
            "operationName": "GetUserAndProducts__reviews__1"
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
                "operation": "query GetUserAndProducts__books__2($representations:[_Any!]!){_entities(representations:$representations){...on Book{title}}}",
                "operationName": "GetUserAndProducts__books__2"
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
                      { "kind": "Field", "name": "isbn" }
                    ]
                  },
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
                "operation": "query GetUserAndProducts__product__3($representations:[_Any!]!){_entities(representations:$representations){...on Book{price}...on Furniture{price}}}",
                "operationName": "GetUserAndProducts__product__3"
              }
            }
          ]
        }
      ]
    }
  }
  """

Scenario: fetches composite fields from a foreign type casted to an interface [@provides field
  Given query
  """
  query GetUserAndProducts {
    me {
      reviews {
        product {
          price
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
          "operation": "query GetUserAndProducts__accounts__0{me{__typename id}}",
          "operationName": "GetUserAndProducts__accounts__0"
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
            "operation": "query GetUserAndProducts__reviews__1($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{product{__typename ...on Book{__typename isbn}...on Furniture{__typename upc}}}}}}",
            "operationName": "GetUserAndProducts__reviews__1"
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
                "serviceName": "product",
                "requires": [
                  {
                    "kind": "InlineFragment",
                    "typeCondition": "Book",
                    "selections": [
                      { "kind": "Field", "name": "__typename" },
                      { "kind": "Field", "name": "isbn" }
                    ]
                  },
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
                "operation": "query GetUserAndProducts__product__2($representations:[_Any!]!){_entities(representations:$representations){...on Book{price}...on Furniture{price}}}",
                "operationName": "GetUserAndProducts__product__2"
              }
            },
            {
              "kind": "Sequence",
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
                    "operation": "query GetUserAndProducts__books__3($representations:[_Any!]!){_entities(representations:$representations){...on Book{title year}}}",
                    "operationName": "GetUserAndProducts__books__3"
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
                    "operation": "query GetUserAndProducts__product__4($representations:[_Any!]!){_entities(representations:$representations){...on Book{name}}}",
                    "operationName": "GetUserAndProducts__product__4"
                  }
                }
              ]
            }
          ]
        }
      ]
    }
  }
  """

Scenario: allows for extending an interface from another service with fields
  Given query
  """
  query GetProduct($upc: String!) {
    product(upc: $upc) {
      reviews {
        body
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
          "serviceName": "product",
          "variableUsages": ["upc"],
          "operationKind": "query",
          "operation": "query GetProduct__product__0($upc:String!){product(upc:$upc){__typename ...on Book{__typename isbn}...on Furniture{__typename upc}}}",
          "operationName": "GetProduct__product__0"
        },
        {
          "kind": "Flatten",
          "path": ["product"],
          "node": {
            "kind": "Fetch",
            "serviceName": "reviews",
            "requires": [
              {
                "kind": "InlineFragment",
                "typeCondition": "Book",
                "selections": [
                  { "kind": "Field", "name": "__typename" },
                  { "kind": "Field", "name": "isbn" }
                ]
              },
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
            "operation": "query GetProduct__reviews__1($representations:[_Any!]!){_entities(representations:$representations){...on Book{reviews{body}}...on Furniture{reviews{body}}}}",
            "operationName": "GetProduct__reviews__1"
          }
        }
      ]
    }
  }
  """

Scenario: handles unions from the same service
  Given query
  """
  query GetUserAndProducts {
    me {
      reviews {
        product {
          price
          ... on Furniture {
            brand {
              ... on Ikea {
                asile
              }
              ... on Amazon {
                referrer
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
          "operation": "query GetUserAndProducts__accounts__0{me{__typename id}}",
          "operationName": "GetUserAndProducts__accounts__0"
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
            "operation": "query GetUserAndProducts__reviews__1($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{product{__typename ...on Book{__typename isbn}...on Furniture{__typename upc}}}}}}",
            "operationName": "GetUserAndProducts__reviews__1"
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
                  { "kind": "Field", "name": "isbn" }
                ]
              },
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
            "operation": "query GetUserAndProducts__product__2($representations:[_Any!]!){_entities(representations:$representations){...on Book{price}...on Furniture{price brand{__typename ...on Ikea{asile}...on Amazon{referrer}}}}}",
            "operationName": "GetUserAndProducts__product__2"
          }
        }
      ]
    }
  }
  """
