Feature: Query Planning > Interface service resolution

Scenario: should resolve externalised interface fields from differenct services with a concrete type query
  Given query
    """
    query {
      node(id: "User:1") {
        ... on User {
            __typename
            id
            createdAt
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
                    "serviceName": "nodes",
                    "variableUsages": [],
                    "operation":"{node(id:\"User:1\"){__typename ...on User{__typename id}}}"
                },
                {
                    "kind": "Flatten",
                    "path": ["node"],
                    "node": {
                        "kind": "Fetch",
                        "serviceName": "accounts",
                        "requires": [
                            {
                                "kind": "InlineFragment",
                                "typeCondition": "User",
                                "selections": [
                                    {"kind": "Field", "name": "__typename" },
                                    {"kind": "Field", "name": "id"}
                                ]
                            }
                        ],
                        "variableUsages": [],
                        "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{id createdAt}}}"
                    }
                }
            ]
        }
    }
    """


Scenario: should resolve externalised interface fields from differenct services with an interface type query
  Given query
    """
    query {
      node(id: "User:1") {
        ... on Node {
            __typename
            id
            createdAt
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
                    "serviceName": "nodes",
                    "variableUsages": [],
                    "operation":"{node(id:\"User:1\"){__typename ...on User{__typename id}}}"
                },
                {
                    "kind": "Flatten",
                    "path": ["node"],
                    "node": {
                        "kind": "Fetch",
                        "serviceName": "accounts",
                        "requires": [
                            {
                                "kind": "InlineFragment",
                                "typeCondition": "User",
                                "selections": [
                                    {"kind": "Field", "name": "__typename" },
                                    {"kind": "Field", "name": "id"}
                                ]
                            }
                        ],
                        "variableUsages": [],
                        "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{id createdAt}}}"
                    }
                }
            ]
        }
    }
    """