Feature: Query Planning > Execution Style

Scenario: supports parallel root fields
  Given query
  """
  query GetUserAndReviews {
    me {
      username
    }
    topReviews {
      body
    }
  }
  """
  Then query plan
  """
  {
    "kind": "QueryPlan",
    "node": {
      "kind": "Parallel",
      "nodes": [
        {
          "kind": "Fetch",
          "serviceName": "accounts",
          "variableUsages": [],
          "operationKind": "query",
          "operation": "query GetUserAndReviews__accounts__0{me{username}}",
          "operationName": "GetUserAndReviews__accounts__0"
        },
        {
          "kind": "Fetch",
          "serviceName": "reviews",
          "variableUsages": [],
          "operationKind": "query",
          "operation": "query GetUserAndReviews__reviews__1{topReviews{body}}",
          "operationName": "GetUserAndReviews__reviews__1"
        }
      ]
    }
  }
  """
