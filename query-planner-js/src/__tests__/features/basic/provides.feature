Feature: Query Planner > Provides

Scenario: does not have to go to another service when field is given
  Given query
  """
  query GetReviewers {
    topReviews {
      author {
        username
      }
    }
  }
  """
  Then query plan
  """
  {
    "kind": "QueryPlan",
    "node": {
      "kind": "Fetch",
      "serviceName": "reviews",
      "variableUsages": [],
      "operationKind": "query",
      "operation": "query GetReviewers_reviews_0{topReviews{author{username}}}",
      "operationName": "GetReviewers_reviews_0"
    }
  }
  """

# make sure the accounts service doesn't have User.username in its query
Scenario: does not load fields provided even when going to other service
  Given query
  """
  query GetReviewers {
    topReviews {
      author {
        username
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
          "serviceName": "reviews",
          "variableUsages": [],
          "operationKind": "query",
          "operation": "query GetReviewers_reviews_0{topReviews{author{__typename id username}}}",
          "operationName": "GetReviewers_reviews_0"
        },
        {
          "kind": "Flatten",
          "path": ["topReviews", "@", "author"],
          "node": {
            "kind": "Fetch",
            "serviceName": "accounts",
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
            "operation": "query GetReviewers_accounts_1($representations:[_Any!]!){_entities(representations:$representations){...on User{name{first}}}}",
            "operationName": "GetReviewers_accounts_1"
          }
        }
      ]
    }
  }
  """
