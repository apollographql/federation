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

  query ProducsWithMetadata {
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
          "operationKind": "query",
          "operation": "query ProducsWithMetadata__product__0{topProducts(first:10){__typename upc ...on Book{__typename isbn}...on Furniture{__typename upc metadata{__typename ...on KeyValue{key value}...on Error{code message}}}}}",
          "operationName": "ProducsWithMetadata__product__0"
        },
        {
          "kind": "Parallel",
          "nodes": [
            {
              "kind": "Flatten",
              "path": ["topProducts", "@"],
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
                "operation": "query ProducsWithMetadata__reviews__1($representations:[_Any!]!){_entities(representations:$representations){...on Book{reviews{metadata{__typename ...on KeyValue{key value}...on Error{code message}}}}...on Furniture{reviews{metadata{__typename ...on KeyValue{key value}...on Error{code message}}}}}}",
                "operationName": "ProducsWithMetadata__reviews__1"
              }
            },
            {
              "kind": "Flatten",
              "path": ["topProducts", "@"],
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
                "operation": "query ProducsWithMetadata__books__2($representations:[_Any!]!){_entities(representations:$representations){...on Book{metadata{__typename ...on KeyValue{key value}...on Error{code message}}}}}",
                "operationName": "ProducsWithMetadata__books__2"
              }
            }
          ]
        }
      ]
    }
  }
  """
