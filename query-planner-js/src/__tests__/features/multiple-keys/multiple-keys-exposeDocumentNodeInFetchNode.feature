Feature: Query Planning > Multiple keys (with ExposeDocumentNodeInFetchNode)

  Scenario: Multiple @key fields
    Given query
      """
        query {
          reviews {
            body
            author {
              name
              risk
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
              "operation": "{reviews{body author{__typename id}}}",
              "operationDocumentNode": {
                "kind": "Document",
                "definitions": [
                  {
                    "kind": "OperationDefinition",
                    "operation": "query",
                    "selectionSet": {
                      "kind": "SelectionSet",
                      "selections": [
                        {
                          "kind": "Field",
                          "name": {
                            "kind": "Name",
                            "value": "reviews"
                          },
                          "selectionSet": {
                            "kind": "SelectionSet",
                            "selections": [
                              {
                                "kind": "Field",
                                "name": {
                                  "kind": "Name",
                                  "value": "body"
                                }
                              },
                              {
                                "kind": "Field",
                                "name": {
                                  "kind": "Name",
                                  "value": "author"
                                },
                                "selectionSet": {
                                  "kind": "SelectionSet",
                                  "selections": [
                                    {
                                      "kind": "Field",
                                      "name": {
                                        "kind": "Name",
                                        "value": "__typename"
                                      }
                                    },
                                    {
                                      "kind": "Field",
                                      "name": {
                                        "kind": "Name",
                                        "value": "id"
                                      }
                                    }
                                  ]
                                }
                              }
                            ]
                          }
                        }
                      ]
                    }
                  }
                ]
              }
            },
            {
              "kind": "Flatten",
              "path": ["reviews", "@", "author"],
              "node": {
                "kind": "Fetch",
                "serviceName": "users",
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
                "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{ssn name}}}",
                "operationDocumentNode": {
                  "kind": "Document",
                  "definitions": [
                    {
                      "kind": "OperationDefinition",
                      "operation": "query",
                      "selectionSet": {
                        "kind": "SelectionSet",
                        "selections": [
                          {
                            "kind": "Field",
                            "name": {
                              "kind": "Name",
                              "value": "_entities"
                            },
                            "arguments": [
                              {
                                "kind": "Argument",
                                "name": {
                                  "kind": "Name",
                                  "value": "representations"
                                },
                                "value": {
                                  "kind": "Variable",
                                  "name": {
                                    "kind": "Name",
                                    "value": "representations"
                                  }
                                }
                              }
                            ],
                            "selectionSet": {
                              "kind": "SelectionSet",
                              "selections": [
                                {
                                  "kind": "InlineFragment",
                                  "typeCondition": {
                                    "kind": "NamedType",
                                    "name": {
                                      "kind": "Name",
                                      "value": "User"
                                    }
                                  },
                                  "selectionSet": {
                                    "kind": "SelectionSet",
                                    "selections": [
                                      {
                                        "kind": "Field",
                                        "name": {
                                          "kind": "Name",
                                          "value": "ssn"
                                        }
                                      },
                                      {
                                        "kind": "Field",
                                        "name": {
                                          "kind": "Name",
                                          "value": "name"
                                        }
                                      }
                                    ]
                                  }
                                }
                              ]
                            }
                          }
                        ]
                      },
                      "variableDefinitions": [
                        {
                          "kind": "VariableDefinition",
                          "variable": {
                            "kind": "Variable",
                            "name": {
                              "kind": "Name",
                              "value": "representations"
                            }
                          },
                          "type": {
                            "kind": "NonNullType",
                            "type": {
                              "kind": "ListType",
                              "type": {
                                "kind": "NonNullType",
                                "type": {
                                  "kind": "NamedType",
                                  "name": {
                                    "kind": "Name",
                                    "value": "_Any"
                                  }
                                }
                              }
                            }
                          }
                        }
                      ]
                    }
                  ]
                }
              }
            },
            {
              "kind": "Flatten",
              "path": ["reviews", "@", "author"],
              "node": {
                "kind": "Fetch",
                "serviceName": "actuary",
                "requires": [
                  {
                    "kind": "InlineFragment",
                    "typeCondition": "User",
                    "selections": [
                      { "kind": "Field", "name": "__typename" },
                      { "kind": "Field", "name": "ssn" }
                    ]
                  }
                ],
                "variableUsages": [],
                "operationKind": "query",
                "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{risk}}}",
                "operationDocumentNode": {
                  "kind": "Document",
                  "definitions": [
                    {
                      "kind": "OperationDefinition",
                      "operation": "query",
                      "selectionSet": {
                        "kind": "SelectionSet",
                        "selections": [
                          {
                            "kind": "Field",
                            "name": {
                              "kind": "Name",
                              "value": "_entities"
                            },
                            "arguments": [
                              {
                                "kind": "Argument",
                                "name": {
                                  "kind": "Name",
                                  "value": "representations"
                                },
                                "value": {
                                  "kind": "Variable",
                                  "name": {
                                    "kind": "Name",
                                    "value": "representations"
                                  }
                                }
                              }
                            ],
                            "selectionSet": {
                              "kind": "SelectionSet",
                              "selections": [
                                {
                                  "kind": "InlineFragment",
                                  "typeCondition": {
                                    "kind": "NamedType",
                                    "name": {
                                      "kind": "Name",
                                      "value": "User"
                                    }
                                  },
                                  "selectionSet": {
                                    "kind": "SelectionSet",
                                    "selections": [
                                      {
                                        "kind": "Field",
                                        "name": {
                                          "kind": "Name",
                                          "value": "risk"
                                        }
                                      }
                                    ]
                                  }
                                }
                              ]
                            }
                          }
                        ]
                      },
                      "variableDefinitions": [
                        {
                          "kind": "VariableDefinition",
                          "variable": {
                            "kind": "Variable",
                            "name": {
                              "kind": "Name",
                              "value": "representations"
                            }
                          },
                          "type": {
                            "kind": "NonNullType",
                            "type": {
                              "kind": "ListType",
                              "type": {
                                "kind": "NonNullType",
                                "type": {
                                  "kind": "NamedType",
                                  "name": {
                                    "kind": "Name",
                                    "value": "_Any"
                                  }
                                }
                              }
                            }
                          }
                        }
                      ]
                    }
                  ]
                }
              }
            }
          ]
        }
      }
      """
