Feature: Query Planning > Custom Directives

Scenario: successfully passes directives along in requests to an underlying service
  Given query
  """
  query GetReviewers {
    topReviews {
      body @stream
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
      "operation": "query GetReviewers__reviews__0{topReviews{body@stream}}",
      "operationName": "GetReviewers__reviews__0"
    }
  }
  """

Scenario: successfully passes directives and their variables along in requests to underlying services
  Given query
  """
  query GetReviewers {
    topReviews {
      body @stream
      author @transform(from: "JSON") {
        name @stream {
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
          "operation": "query GetReviewers__reviews__0{topReviews{body@stream author@transform(from:\"JSON\"){__typename id}}}",
          "operationName": "GetReviewers__reviews__0"
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
            "operation": "query GetReviewers__accounts__1($representations:[_Any!]!){_entities(representations:$representations){...on User{name@stream{first}}}}",
            "operationName": "GetReviewers__accounts__1"
          }
        }
      ]
    }
  }
  """
