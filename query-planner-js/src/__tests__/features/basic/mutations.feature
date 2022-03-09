Feature: Query Planning > Mutations

Scenario: supports mutations
  Given query
  """
  mutation Login($username: String!, $password: String!) {
    login(username: $username, password: $password) {
      reviews {
        product {
          upc
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
          "variableUsages": ["username", "password"],
          "operationKind": "mutation",
          "operation": "mutation Login__accounts__0($username:String!$password:String!){login(username:$username password:$password){__typename id}}",
          "operationName": "Login__accounts__0"
        },
        {
          "kind": "Flatten",
          "path": ["login"],
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
            "operation": "query Login__reviews__1($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{product{__typename ...on Book{__typename isbn}...on Furniture{upc}}}}}}",
            "operationName": "Login__reviews__1"
          }
        },
        {
          "kind": "Flatten",
          "path": ["login", "reviews", "@", "product"],
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
              }
            ],
            "variableUsages": [],
            "operationKind": "query",
            "operation": "query Login__product__2($representations:[_Any!]!){_entities(representations:$representations){...on Book{upc}}}",
            "operationName": "Login__product__2"
          }
        }
      ]
    }
  }
  """

Scenario: mutations across service boundaries
  Given query
  """
  mutation Review($upc: String!, $body: String!) {
    reviewProduct(input: { upc: $upc, body: $body }) {
      ... on Furniture {
        name
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
          "serviceName": "reviews",
          "variableUsages": ["upc", "body"],
          "operationKind": "mutation",
          "operation": "mutation Review__reviews__0($upc:String!$body:String!){reviewProduct(input:{upc:$upc body:$body}){__typename ...on Furniture{__typename upc}}}",
          "operationName": "Review__reviews__0"
        },
        {
          "kind": "Flatten",
          "path": ["reviewProduct"],
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
            "operation": "query Review__product__1($representations:[_Any!]!){_entities(representations:$representations){...on Furniture{name}}}",
            "operationName": "Review__product__1"
          }
        }
      ]
    }
  }

  """

Scenario: multiple root mutations
  Given query
  """
  mutation LoginAndReview(
    $username: String!
    $password: String!
    $upc: String!
    $body: String!
  ) {
    login(username: $username, password: $password) {
      reviews {
        product {
          upc
        }
      }
    }
    reviewProduct(input: { upc: $upc, body: $body }) {
      ... on Furniture {
        name
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
          "variableUsages": ["username", "password"],
          "operationKind": "mutation",
          "operation": "mutation LoginAndReview__accounts__0($username:String!$password:String!){login(username:$username password:$password){__typename id}}",
          "operationName": "LoginAndReview__accounts__0"
        },
        {
          "kind": "Flatten",
          "path": ["login"],
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
            "operation": "query LoginAndReview__reviews__1($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{product{__typename ...on Book{__typename isbn}...on Furniture{upc}}}}}}",
            "operationName": "LoginAndReview__reviews__1"
          }
        },
        {
          "kind": "Flatten",
          "path": ["login", "reviews", "@", "product"],
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
              }
            ],
            "variableUsages": [],
            "operationKind": "query",
            "operation": "query LoginAndReview__product__2($representations:[_Any!]!){_entities(representations:$representations){...on Book{upc}}}",
            "operationName": "LoginAndReview__product__2"
          }
        },
        {
          "kind": "Fetch",
          "serviceName": "reviews",
          "variableUsages": ["upc", "body"],
          "operationKind": "mutation",
          "operation": "mutation LoginAndReview__reviews__3($upc:String!$body:String!){reviewProduct(input:{upc:$upc body:$body}){__typename ...on Furniture{__typename upc}}}",
          "operationName": "LoginAndReview__reviews__3"
        },
        {
          "kind": "Flatten",
          "path": ["reviewProduct"],
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
            "operation": "query LoginAndReview__product__4($representations:[_Any!]!){_entities(representations:$representations){...on Furniture{name}}}",
            "operationName": "LoginAndReview__product__4"
          }
        }
      ]
    }
  }
  """

# important: order: Review > Update > Login > Delete
Scenario: multiple root mutations with correct service order
  Given query
  """
  mutation LoginAndReview(
    $upc: String!
    $body: String!
    $updatedReview: UpdateReviewInput!
    $username: String!
    $password: String!
    $reviewId: ID!
  ) {
    reviewProduct(input: { upc: $upc, body: $body }) {
      ... on Furniture {
        upc
      }
    }
    updateReview(review: $updatedReview) {
      id
      body
    }
    login(username: $username, password: $password) {
      reviews {
        product {
          upc
        }
      }
    }
    deleteReview(id: $reviewId)
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
          "serviceName": "reviews",
          "variableUsages": ["upc", "body", "updatedReview"],
          "operationKind": "mutation",
          "operation": "mutation LoginAndReview__reviews__0($upc:String!$body:String!$updatedReview:UpdateReviewInput!){reviewProduct(input:{upc:$upc body:$body}){__typename ...on Furniture{upc}}updateReview(review:$updatedReview){id body}}",
          "operationName": "LoginAndReview__reviews__0"
        },
        {
          "kind": "Fetch",
          "serviceName": "accounts",
          "variableUsages": ["username", "password"],
          "operationKind": "mutation",
          "operation": "mutation LoginAndReview__accounts__1($username:String!$password:String!){login(username:$username password:$password){__typename id}}",
          "operationName": "LoginAndReview__accounts__1"
        },
        {
          "kind": "Flatten",
          "path": ["login"],
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
            "operation": "query LoginAndReview__reviews__2($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{product{__typename ...on Book{__typename isbn}...on Furniture{upc}}}}}}",
            "operationName": "LoginAndReview__reviews__2"
          }
        },
        {
          "kind": "Flatten",
          "path": ["login", "reviews", "@", "product"],
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
              }
            ],
            "variableUsages": [],
            "operationKind": "query",
            "operation": "query LoginAndReview__product__3($representations:[_Any!]!){_entities(representations:$representations){...on Book{upc}}}",
            "operationName": "LoginAndReview__product__3"
          }
        },
        {
          "kind": "Fetch",
          "serviceName": "reviews",
          "variableUsages": ["reviewId"],
          "operationKind": "mutation",
          "operation": "mutation LoginAndReview__reviews__4($reviewId:ID!){deleteReview(id:$reviewId)}",
          "operationName": "LoginAndReview__reviews__4"
        }
      ]
    }
  }
  """
