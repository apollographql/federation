Feature: Query Planning > Variables

# calls product with variable
Scenario: passes variables to root fields
  Given query
  """
  query GetProduct($upc: String!) {
    product(upc: $upc) {
      name
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
          "operation": "query GetProduct__product__0($upc:String!){product(upc:$upc){__typename ...on Book{__typename isbn}...on Furniture{name}}}",
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

# calls product with default variable
Scenario: supports default variables in a variable definition
  Given query
  """
  query GetProduct($upc: String = "1") {
    product(upc: $upc) {
      name
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
          "operation": "query GetProduct__product__0($upc:String=\"1\"){product(upc:$upc){__typename ...on Book{__typename isbn}...on Furniture{name}}}",
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

# calls reviews service with variable; calls accounts
Scenario: passes variables to nested services
  Given query
  """
  query GetProductsForUser($format: Boolean) {
    me {
      reviews {
        body(format: $format)
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
          "operation": "query GetProductsForUser__accounts__0{me{__typename id}}",
          "operationName": "GetProductsForUser__accounts__0"
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
            "operation": "query GetProductsForUser__reviews__1($representations:[_Any!]!$format:Boolean){_entities(representations:$representations){...on User{reviews{body(format:$format)}}}}",
            "operationName": "GetProductsForUser__reviews__1"
          }
        }
      ]
    }
  }
  """

# XXX I think this test relies on execution to use the default variable, not the query plan
Scenario: works with default variables in the schema
  Given query
  """
  query LibraryUser($libraryId: ID!, $userId: ID) {
    library(id: $libraryId) {
      userAccount(id: $userId) {
        id
        name {
          first
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
          "serviceName": "books",
          "variableUsages": ["libraryId"],
          "operationKind": "query",
          "operation": "query LibraryUser__books__0($libraryId:ID!){library(id:$libraryId){__typename id name}}",
          "operationName": "LibraryUser__books__0"
        },
        {
          "kind": "Flatten",
          "path": ["library"],
          "node": {
            "kind": "Fetch",
            "serviceName": "accounts",
            "requires": [
              {
                "kind": "InlineFragment",
                "typeCondition": "Library",
                "selections": [
                  { "kind": "Field", "name": "__typename" },
                  { "kind": "Field", "name": "id" },
                  { "kind": "Field", "name": "name" }
                ]
              }
            ],
            "variableUsages": ["userId"],
            "operationKind": "query",
            "operation": "query LibraryUser__accounts__1($representations:[_Any!]!$userId:ID){_entities(representations:$representations){...on Library{userAccount(id:$userId){id name{first}}}}}",
            "operationName": "LibraryUser__accounts__1"
          }
        }
      ]
    }
  }
  """

Scenario: String arguments with quotes that need to be escaped.
  Given query
  """
  query {
    vehicle(id: "{\"make\":\"Toyota\",\"model\":\"Rav4\",\"trim\":\"Limited\"}") {
      description
    }
  }
  """
  Then query plan
  """
  {
    "kind": "QueryPlan",
    "node": {
      "kind": "Fetch",
      "serviceName": "product",
      "variableUsages": [],
      "operationKind": "query",
      "operation": "{vehicle(id:\"{\\\"make\\\":\\\"Toyota\\\",\\\"model\\\":\\\"Rav4\\\",\\\"trim\\\":\\\"Limited\\\"}\"){__typename ...on Car{description}...on Van{description}}}"
    }
  }
  """
