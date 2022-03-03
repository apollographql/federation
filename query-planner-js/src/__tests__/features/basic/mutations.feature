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
          "operation": "mutation Login_accounts_0($username:String!$password:String!){login(username:$username password:$password){__typename id}}",
          "operationName": "Login_accounts_0"
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
            "operation": "query Login_reviews_1($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{product{__typename ...on Book{__typename isbn}...on Furniture{upc}}}}}}",
            "operationName": "Login_reviews_1"
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
            "operation": "query Login_product_2($representations:[_Any!]!){_entities(representations:$representations){...on Book{upc}}}",
            "operationName": "Login_product_2"
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
          "operation": "mutation Review_reviews_0($upc:String!$body:String!){reviewProduct(input:{upc:$upc body:$body}){__typename ...on Furniture{__typename upc}}}",
          "operationName": "Review_reviews_0"
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
            "operation": "query Review_product_1($representations:[_Any!]!){_entities(representations:$representations){...on Furniture{name}}}",
            "operationName": "Review_product_1"
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
          "operation": "mutation LoginAndReview_accounts_0($username:String!$password:String!){login(username:$username password:$password){__typename id}}",
          "operationName": "LoginAndReview_accounts_0"
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
            "operation": "query LoginAndReview_reviews_1($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{product{__typename ...on Book{__typename isbn}...on Furniture{upc}}}}}}",
            "operationName": "LoginAndReview_reviews_1"
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
            "operation": "query LoginAndReview_product_2($representations:[_Any!]!){_entities(representations:$representations){...on Book{upc}}}",
            "operationName": "LoginAndReview_product_2"
          }
        },
        {
          "kind": "Fetch",
          "serviceName": "reviews",
          "variableUsages": ["upc", "body"],
          "operationKind": "mutation",
          "operation": "mutation LoginAndReview_reviews_3($upc:String!$body:String!){reviewProduct(input:{upc:$upc body:$body}){__typename ...on Furniture{__typename upc}}}",
          "operationName": "LoginAndReview_reviews_3"
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
            "operation": "query LoginAndReview_product_4($representations:[_Any!]!){_entities(representations:$representations){...on Furniture{name}}}",
            "operationName": "LoginAndReview_product_4"
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
          "operation": "mutation LoginAndReview_reviews_0($upc:String!$body:String!$updatedReview:UpdateReviewInput!){reviewProduct(input:{upc:$upc body:$body}){__typename ...on Furniture{upc}}updateReview(review:$updatedReview){id body}}",
          "operationName": "LoginAndReview_reviews_0"
        },
        {
          "kind": "Fetch",
          "serviceName": "accounts",
          "variableUsages": ["username", "password"],
          "operationKind": "mutation",
          "operation": "mutation LoginAndReview_accounts_1($username:String!$password:String!){login(username:$username password:$password){__typename id}}",
          "operationName": "LoginAndReview_accounts_1"
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
            "operation": "query LoginAndReview_reviews_2($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{product{__typename ...on Book{__typename isbn}...on Furniture{upc}}}}}}",
            "operationName": "LoginAndReview_reviews_2"
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
            "operation": "query LoginAndReview_product_3($representations:[_Any!]!){_entities(representations:$representations){...on Book{upc}}}",
            "operationName": "LoginAndReview_product_3"
          }
        },
        {
          "kind": "Fetch",
          "serviceName": "reviews",
          "variableUsages": ["reviewId"],
          "operationKind": "mutation",
          "operation": "mutation LoginAndReview_reviews_4($reviewId:ID!){deleteReview(id:$reviewId)}",
          "operationName": "LoginAndReview_reviews_4"
        }
      ]
    }
  }
  """
