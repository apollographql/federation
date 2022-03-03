Feature: Query Planning > Aliases


Scenario: supports simple aliases
  Given query
  """
  query GetProduct($upc: String!) {
    product(upc: $upc) {
      name
      title: name
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
          "operation": "query GetProduct_product_0($upc:String!){product(upc:$upc){__typename ...on Book{__typename isbn}...on Furniture{name title:name}}}",
          "operationName": "GetProduct_product_0"
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
            "operation": "query GetProduct_books_1($representations:[_Any!]!){_entities(representations:$representations){...on Book{title year}}}",
            "operationName": "GetProduct_books_1"
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
            "operation": "query GetProduct_product_2($representations:[_Any!]!){_entities(representations:$representations){...on Book{title:name name}}}",
            "operationName": "GetProduct_product_2"
          }
        }
      ]
    }
  }
  """

Scenario: supports aliases of root fields on subservices
  Given query
  """
  query GetProduct($upc: String!) {
    product(upc: $upc) {
      name
      title: name
      reviews {
        body
      }
      productReviews: reviews {
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
          "operation": "query GetProduct_product_0($upc:String!){product(upc:$upc){__typename ...on Book{__typename isbn}...on Furniture{__typename upc name title:name}}}",
          "operationName": "GetProduct_product_0"
        },
        {
          "kind": "Parallel",
          "nodes": [
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
                "operation": "query GetProduct_reviews_1($representations:[_Any!]!){_entities(representations:$representations){...on Book{reviews{body}productReviews:reviews{body}}...on Furniture{reviews{body}productReviews:reviews{body}}}}",
                "operationName": "GetProduct_reviews_1"
              }
            },
            {
              "kind": "Sequence",
              "nodes": [
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
                    "operation": "query GetProduct_books_2($representations:[_Any!]!){_entities(representations:$representations){...on Book{title year}}}",
                    "operationName": "GetProduct_books_2"
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
                    "operation": "query GetProduct_product_3($representations:[_Any!]!){_entities(representations:$representations){...on Book{title:name name}}}",
                    "operationName": "GetProduct_product_3"
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

Scenario: supports aliases of nested fields on subservices
  Given query
  """
  query GetProduct($upc: String!) {
    product(upc: $upc) {
      name
      title: name
      reviews {
        content: body
        body
      }
      productReviews: reviews {
        body
        reviewer: author {
          name: username
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
          "serviceName": "product",
          "variableUsages": ["upc"],
          "operationKind": "query",
          "operation": "query GetProduct_product_0($upc:String!){product(upc:$upc){__typename ...on Book{__typename isbn}...on Furniture{__typename upc name title:name}}}",
          "operationName": "GetProduct_product_0"
        },
        {
          "kind": "Parallel",
          "nodes": [
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
                "operation": "query GetProduct_reviews_1($representations:[_Any!]!){_entities(representations:$representations){...on Book{reviews{content:body body}productReviews:reviews{body reviewer:author{name:username}}}...on Furniture{reviews{content:body body}productReviews:reviews{body reviewer:author{name:username}}}}}",
                "operationName": "GetProduct_reviews_1"
              }
            },
            {
              "kind": "Sequence",
              "nodes": [
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
                    "operation": "query GetProduct_books_2($representations:[_Any!]!){_entities(representations:$representations){...on Book{title year}}}",
                    "operationName": "GetProduct_books_2"
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
                    "operation": "query GetProduct_product_3($representations:[_Any!]!){_entities(representations:$representations){...on Book{title:name name}}}",
                    "operationName": "GetProduct_product_3"
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
