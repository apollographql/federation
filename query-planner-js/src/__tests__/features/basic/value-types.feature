Feature: Query Planner > Value Types

Scenario: resolves value types within their respective services
  Given query
  """
  fragment Metadata on MetadataOrError {
    ... on KeyValue {
      key
      value
    }
    ... on Error {
      code
      message
    }
  }

  query ProductsWithMetadata {
    topProducts(first: 10) {
      upc
      ... on Book {
        metadata {
          ...Metadata
        }
      }
      ... on Furniture {
        metadata {
          ...Metadata
        }
      }
      reviews {
        metadata {
          ...Metadata
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
          "variableUsages": [],
          "operation": "query ProductsWithMetadata__product__0{topProducts(first:10){__typename ...on Book{upc __typename isbn}...on Furniture{upc metadata{__typename ...on KeyValue{key value}...on Error{code message}}__typename}}}",
          "operationName": "ProductsWithMetadata__product__0",
          "operationKind": "query"
        },
        {
          "kind": "Parallel",
          "nodes": [
            {
              "kind": "Flatten",
              "path": [
                "topProducts",
                "@"
              ],
              "node": {
                "kind": "Fetch",
                "serviceName": "books",
                "requires": [
                  {
                    "kind": "InlineFragment",
                    "typeCondition": "Book",
                    "selections": [
                      {
                        "kind": "Field",
                        "name": "__typename"
                      },
                      {
                        "kind": "Field",
                        "name": "isbn"
                      }
                    ]
                  }
                ],
                "variableUsages": [],
                "operation": "query ProductsWithMetadata__books__1($representations:[_Any!]!){_entities(representations:$representations){...on Book{metadata{__typename ...on KeyValue{key value}...on Error{code message}}}}}",
                "operationName": "ProductsWithMetadata__books__1",
                "operationKind": "query"
              }
            },
            {
              "kind": "Flatten",
              "path": [
                "topProducts",
                "@"
              ],
              "node": {
                "kind": "Fetch",
                "serviceName": "reviews",
                "requires": [
                  {
                    "kind": "InlineFragment",
                    "typeCondition": "Book",
                    "selections": [
                      {
                        "kind": "Field",
                        "name": "__typename"
                      },
                      {
                        "kind": "Field",
                        "name": "isbn"
                      }
                    ]
                  },
                  {
                    "kind": "InlineFragment",
                    "typeCondition": "Furniture",
                    "selections": [
                      {
                        "kind": "Field",
                        "name": "__typename"
                      },
                      {
                        "kind": "Field",
                        "name": "upc"
                      }
                    ]
                  }
                ],
                "variableUsages": [],
                "operation": "query ProductsWithMetadata__reviews__2($representations:[_Any!]!){_entities(representations:$representations){...on Book{reviews{metadata{__typename ...on KeyValue{key value}...on Error{code message}}}}...on Furniture{reviews{metadata{__typename ...on KeyValue{key value}...on Error{code message}}}}}}",
                "operationName": "ProductsWithMetadata__reviews__2",
                "operationKind": "query"
              }
            }
          ]
        }
      ]
    }
  }
  """
