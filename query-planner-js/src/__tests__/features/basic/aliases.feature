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
          "operation": "query($upc:String!){product(upc:$upc){__typename ...on Book{__typename isbn}...on Furniture{name title:name}}}"
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
            "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{title year}}}"
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
            "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{title:name name}}}"
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
          "operation": "query($upc:String!){product(upc:$upc){__typename ...on Book{__typename isbn}...on Furniture{__typename upc name title:name}}}"
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
                "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{reviews{body}productReviews:reviews{body}}...on Furniture{reviews{body}productReviews:reviews{body}}}}"
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
                    "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{title year}}}"
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
                    "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{title:name name}}}"
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
          "operation": "query($upc:String!){product(upc:$upc){__typename ...on Book{__typename isbn}...on Furniture{__typename upc name title:name}}}"
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
                "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{reviews{content:body body}productReviews:reviews{body reviewer:author{name:username}}}...on Furniture{reviews{content:body body}productReviews:reviews{body reviewer:author{name:username}}}}}"
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
                    "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{title year}}}"
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
                    "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{title:name name}}}"
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
