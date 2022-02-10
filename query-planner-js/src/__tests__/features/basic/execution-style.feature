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
          "operation": "{me{username}}"
        },
        {
          "kind": "Fetch",
          "serviceName": "reviews",
          "variableUsages": [],
          "operationKind": "query",
          "operation": "{topReviews{body}}"
        }
      ]
    }
  }
  """
