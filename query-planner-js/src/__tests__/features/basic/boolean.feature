Feature: Query Planning > Boolean

Scenario: supports @skip when a boolean condition is met
  Given query
  """
  query GetReviewers {
    topReviews {
      body
      author @skip(if: true) {
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
          "operation": "query GetReviewers_reviews_0{topReviews{body author@skip(if:true){__typename id}}}",
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
            "operation": "query GetReviewers_accounts_1($representations:[_Any!]!){_entities(representations:$representations){...on User@skip(if:true){name{first}}}}",
            "operationName": "GetReviewers_accounts_1"
          }
        }
      ]
    }
  }
  """

Scenario: supports @skip when a boolean condition is met (variable driven)
  Given query
  """
  query GetReviewers($skip: Boolean! = true) {
    topReviews {
      body
      author @skip(if: $skip) {
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
      "variableUsages": ["skip"],
      "operationKind": "query",
      "operation": "query GetReviewers_reviews_0($skip:Boolean!=true){topReviews{body author@skip(if:$skip){username}}}",
      "operationName": "GetReviewers_reviews_0"
    }
  }
  """

Scenario: supports @skip when a boolean condition is not met
  Given query
  """
  query GetReviewers {
    topReviews {
      body
      author @skip(if: false) {
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
          "operation": "query GetReviewers_reviews_0{topReviews{body author@skip(if:false){__typename id}}}",
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
            "operation": "query GetReviewers_accounts_1($representations:[_Any!]!){_entities(representations:$representations){...on User@skip(if:false){name{first}}}}",
            "operationName": "GetReviewers_accounts_1"
          }
        }
      ]
    }
  }
  """

Scenario: supports @skip when a boolean condition is not met (variable driven)
  Given query
  """
  query GetReviewers($skip: Boolean!) {
    topReviews {
      body
      author @skip(if: $skip) {
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
          "variableUsages": ["skip"],
          "operationKind": "query",
          "operation": "query GetReviewers_reviews_0($skip:Boolean!){topReviews{body author@skip(if:$skip){__typename id}}}",
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
            "variableUsages": ["skip"],
            "operationKind": "query",
            "operation": "query GetReviewers_accounts_1($representations:[_Any!]!$skip:Boolean!){_entities(representations:$representations){...on User@skip(if:$skip){name{first}}}}",
            "operationName": "GetReviewers_accounts_1"
          }
        }
      ]
    }
  }
  """

Scenario: supports @include when a boolean condition is not met
  Given query
  """
  query GetReviewers {
    topReviews {
      body
      author @include(if: false) {
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
      "operation": "query GetReviewers_reviews_0{topReviews{body author@include(if:false){username}}}",
      "operationName": "GetReviewers_reviews_0"
    }
  }
  """

Scenario: supports @include when a boolean condition is not met (variable driven)
  Given query
  """
  query GetReviewers($include: Boolean! = false) {
    topReviews {
      body
      author @include(if: $include) {
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
      "variableUsages": ["include"],
      "operationKind": "query",
      "operation": "query GetReviewers_reviews_0($include:Boolean!=false){topReviews{body author@include(if:$include){username}}}",
      "operationName": "GetReviewers_reviews_0"
    }
  }
  """

Scenario: supports @include when a boolean condition is met
  Given query
  """
  query GetReviewers {
    topReviews {
      body
      author @include(if: true) {
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
          "operation": "query GetReviewers_reviews_0{topReviews{body author@include(if:true){__typename id}}}",
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
            "operation": "query GetReviewers_accounts_1($representations:[_Any!]!){_entities(representations:$representations){...on User@include(if:true){name{first}}}}",
            "operationName": "GetReviewers_accounts_1"
          }
        }
      ]
    }
  }
  """



Scenario: supports @include when a boolean condition is met (variable driven)
  Given query
  """
  query GetReviewers($include: Boolean!) {
    topReviews {
      body
      author @include(if: $include) {
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
          "variableUsages": ["include"],
          "operationKind": "query",
          "operation": "query GetReviewers_reviews_0($include:Boolean!){topReviews{body author@include(if:$include){__typename id}}}",
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
            "variableUsages": ["include"],
            "operationKind": "query",
            "operation": "query GetReviewers_accounts_1($representations:[_Any!]!$include:Boolean!){_entities(representations:$representations){...on User@include(if:$include){name{first}}}}",
            "operationName": "GetReviewers_accounts_1"
          }
        }
      ]
    }
  }
  """
