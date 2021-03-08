use crate::helpers::plan;
use apollo_query_planner::QueryPlanningOptions;
use insta::assert_snapshot;

#[allow(non_snake_case)]
#[test]
fn abstract_types_handles_an_abstract_type_from_the_base_service() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetProduct($upc: String!) {
  product(upc: $upc) {
    upc
    name
    price
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "product",
        "variableUsages": [
          "upc"
        ],
        "operation": "query($upc:String!){product(upc:$upc){__typename ...on Book{upc __typename isbn price}...on Furniture{upc name price}}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "product"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "books",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "Book",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "isbn"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{__typename isbn title year}}}"
        }
      },
      {
        "kind": "Flatten",
        "path": [
          "product"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "product",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "Book",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "isbn"
                },
                {
                  "kind": "Field",
                  "name": "title"
                },
                {
                  "kind": "Field",
                  "name": "year"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{name}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn abstract_types_can_request_fields_on_extended_interfaces() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetProduct($upc: String!) {
  product(upc: $upc) {
    inStock
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "product",
        "variableUsages": [
          "upc"
        ],
        "operation": "query($upc:String!){product(upc:$upc){__typename ...on Book{__typename isbn}...on Furniture{__typename sku}}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "product"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "inventory",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "Book",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "isbn"
                }
              ]
            },
            {
              "kind": "InlineFragment",
              "typeCondition": "Furniture",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "sku"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{inStock}...on Furniture{inStock}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn abstract_types_can_request_fields_on_extended_types_that_implement_an_interface() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetProduct($upc: String!) {
  product(upc: $upc) {
    inStock
    ... on Furniture {
      isHeavy
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "product",
        "variableUsages": [
          "upc"
        ],
        "operation": "query($upc:String!){product(upc:$upc){__typename ...on Book{__typename isbn}...on Furniture{__typename sku}}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "product"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "inventory",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "Book",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "isbn"
                }
              ]
            },
            {
              "kind": "InlineFragment",
              "typeCondition": "Furniture",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "sku"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{inStock}...on Furniture{inStock isHeavy}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn abstract_types_prunes_unfilled_type_conditions() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetProduct($upc: String!) {
  product(upc: $upc) {
    inStock
    ... on Furniture {
      isHeavy
    }
    ... on Book {
      isCheckedOut
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "product",
        "variableUsages": [
          "upc"
        ],
        "operation": "query($upc:String!){product(upc:$upc){__typename ...on Book{__typename isbn}...on Furniture{__typename sku}}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "product"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "inventory",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "Book",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "isbn"
                }
              ]
            },
            {
              "kind": "InlineFragment",
              "typeCondition": "Furniture",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "sku"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{inStock isCheckedOut}...on Furniture{inStock isHeavy}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn abstract_types_fetches_interfaces_returned_from_other_services() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetUserAndProducts {
  me {
    reviews {
      product {
        price
        ... on Book {
          title
        }
      }
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "accounts",
        "variableUsages": [],
        "operation": "{me{__typename id}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "me"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "reviews",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{product{__typename ...on Book{__typename isbn}...on Furniture{__typename upc}}}}}}"
        }
      },
      {
        "kind": "Parallel",
        "nodes": [
          {
            "kind": "Flatten",
            "path": [
              "me",
              "reviews",
              "@",
              "product"
            ],
            "node": {
              "kind": "Fetch",
              "serviceName": "product",
              "requires": [
                {
                  "kind": "InlineFragment",
                  "typeCondition": "Book",
                  "selections": [
                    {
                      "kind": "Field",
                      "name": "__typename"
                    },
                    {
                      "kind": "Field",
                      "name": "isbn"
                    }
                  ]
                },
                {
                  "kind": "InlineFragment",
                  "typeCondition": "Furniture",
                  "selections": [
                    {
                      "kind": "Field",
                      "name": "__typename"
                    },
                    {
                      "kind": "Field",
                      "name": "upc"
                    }
                  ]
                }
              ],
              "variableUsages": [],
              "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{price}...on Furniture{price}}}"
            }
          },
          {
            "kind": "Flatten",
            "path": [
              "me",
              "reviews",
              "@",
              "product"
            ],
            "node": {
              "kind": "Fetch",
              "serviceName": "books",
              "requires": [
                {
                  "kind": "InlineFragment",
                  "typeCondition": "Book",
                  "selections": [
                    {
                      "kind": "Field",
                      "name": "__typename"
                    },
                    {
                      "kind": "Field",
                      "name": "isbn"
                    }
                  ]
                }
              ],
              "variableUsages": [],
              "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{title}}}"
            }
          }
        ]
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn abstract_types_fetches_composite_fields_from_a_foreign_type_casted_to_an_interface_provides_field(
) {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetUserAndProducts {
  me {
    reviews {
      product {
        price
        ... on Book {
          name
        }
      }
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "accounts",
        "variableUsages": [],
        "operation": "{me{__typename id}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "me"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "reviews",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{product{__typename ...on Book{__typename isbn}...on Furniture{__typename upc}}}}}}"
        }
      },
      {
        "kind": "Parallel",
        "nodes": [
          {
            "kind": "Flatten",
            "path": [
              "me",
              "reviews",
              "@",
              "product"
            ],
            "node": {
              "kind": "Fetch",
              "serviceName": "product",
              "requires": [
                {
                  "kind": "InlineFragment",
                  "typeCondition": "Book",
                  "selections": [
                    {
                      "kind": "Field",
                      "name": "__typename"
                    },
                    {
                      "kind": "Field",
                      "name": "isbn"
                    }
                  ]
                },
                {
                  "kind": "InlineFragment",
                  "typeCondition": "Furniture",
                  "selections": [
                    {
                      "kind": "Field",
                      "name": "__typename"
                    },
                    {
                      "kind": "Field",
                      "name": "upc"
                    }
                  ]
                }
              ],
              "variableUsages": [],
              "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{price}...on Furniture{price}}}"
            }
          },
          {
            "kind": "Sequence",
            "nodes": [
              {
                "kind": "Flatten",
                "path": [
                  "me",
                  "reviews",
                  "@",
                  "product"
                ],
                "node": {
                  "kind": "Fetch",
                  "serviceName": "books",
                  "requires": [
                    {
                      "kind": "InlineFragment",
                      "typeCondition": "Book",
                      "selections": [
                        {
                          "kind": "Field",
                          "name": "__typename"
                        },
                        {
                          "kind": "Field",
                          "name": "isbn"
                        }
                      ]
                    }
                  ],
                  "variableUsages": [],
                  "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{__typename isbn title year}}}"
                }
              },
              {
                "kind": "Flatten",
                "path": [
                  "me",
                  "reviews",
                  "@",
                  "product"
                ],
                "node": {
                  "kind": "Fetch",
                  "serviceName": "product",
                  "requires": [
                    {
                      "kind": "InlineFragment",
                      "typeCondition": "Book",
                      "selections": [
                        {
                          "kind": "Field",
                          "name": "__typename"
                        },
                        {
                          "kind": "Field",
                          "name": "isbn"
                        },
                        {
                          "kind": "Field",
                          "name": "title"
                        },
                        {
                          "kind": "Field",
                          "name": "year"
                        }
                      ]
                    }
                  ],
                  "variableUsages": [],
                  "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{name}}}"
                }
              }
            ]
          }
        ]
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn abstract_types_allows_for_extending_an_interface_from_another_service_with_fields() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetProduct($upc: String!) {
  product(upc: $upc) {
    reviews {
      body
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "product",
        "variableUsages": [
          "upc"
        ],
        "operation": "query($upc:String!){product(upc:$upc){__typename ...on Book{__typename isbn}...on Furniture{__typename upc}}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "product"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "reviews",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "Book",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "isbn"
                }
              ]
            },
            {
              "kind": "InlineFragment",
              "typeCondition": "Furniture",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "upc"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{reviews{body}}...on Furniture{reviews{body}}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn abstract_types_handles_unions_from_the_same_service() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetUserAndProducts {
  me {
    reviews {
      product {
        price
        ... on Furniture {
          brand {
            ... on Ikea {
              asile
            }
            ... on Amazon {
              referrer
            }
          }
        }
      }
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "accounts",
        "variableUsages": [],
        "operation": "{me{__typename id}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "me"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "reviews",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{product{__typename ...on Book{__typename isbn}...on Furniture{__typename upc}}}}}}"
        }
      },
      {
        "kind": "Flatten",
        "path": [
          "me",
          "reviews",
          "@",
          "product"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "product",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "Book",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "isbn"
                }
              ]
            },
            {
              "kind": "InlineFragment",
              "typeCondition": "Furniture",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "upc"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{price}...on Furniture{price brand{__typename ...on Ikea{asile}...on Amazon{referrer}}}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn aliases_supports_simple_aliases() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetProduct($upc: String!) {
  product(upc: $upc) {
    name
    title: name
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "product",
        "variableUsages": [
          "upc"
        ],
        "operation": "query($upc:String!){product(upc:$upc){__typename ...on Book{__typename isbn}...on Furniture{name title:name}}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "product"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "books",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "Book",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "isbn"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{__typename isbn title year}}}"
        }
      },
      {
        "kind": "Flatten",
        "path": [
          "product"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "product",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "Book",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "isbn"
                },
                {
                  "kind": "Field",
                  "name": "title"
                },
                {
                  "kind": "Field",
                  "name": "year"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{name title:name}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn aliases_supports_aliases_of_root_fields_on_subservices() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetProduct($upc: String!) {
  product(upc: $upc) {
    name
    title: name
    reviews {
      body
    }
    productReviews: reviews {
      body
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "product",
        "variableUsages": [
          "upc"
        ],
        "operation": "query($upc:String!){product(upc:$upc){__typename ...on Book{__typename isbn}...on Furniture{name title:name __typename upc}}}"
      },
      {
        "kind": "Parallel",
        "nodes": [
          {
            "kind": "Sequence",
            "nodes": [
              {
                "kind": "Flatten",
                "path": [
                  "product"
                ],
                "node": {
                  "kind": "Fetch",
                  "serviceName": "books",
                  "requires": [
                    {
                      "kind": "InlineFragment",
                      "typeCondition": "Book",
                      "selections": [
                        {
                          "kind": "Field",
                          "name": "__typename"
                        },
                        {
                          "kind": "Field",
                          "name": "isbn"
                        }
                      ]
                    }
                  ],
                  "variableUsages": [],
                  "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{__typename isbn title year}}}"
                }
              },
              {
                "kind": "Flatten",
                "path": [
                  "product"
                ],
                "node": {
                  "kind": "Fetch",
                  "serviceName": "product",
                  "requires": [
                    {
                      "kind": "InlineFragment",
                      "typeCondition": "Book",
                      "selections": [
                        {
                          "kind": "Field",
                          "name": "__typename"
                        },
                        {
                          "kind": "Field",
                          "name": "isbn"
                        },
                        {
                          "kind": "Field",
                          "name": "title"
                        },
                        {
                          "kind": "Field",
                          "name": "year"
                        }
                      ]
                    }
                  ],
                  "variableUsages": [],
                  "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{name title:name}}}"
                }
              }
            ]
          },
          {
            "kind": "Flatten",
            "path": [
              "product"
            ],
            "node": {
              "kind": "Fetch",
              "serviceName": "reviews",
              "requires": [
                {
                  "kind": "InlineFragment",
                  "typeCondition": "Book",
                  "selections": [
                    {
                      "kind": "Field",
                      "name": "__typename"
                    },
                    {
                      "kind": "Field",
                      "name": "isbn"
                    }
                  ]
                },
                {
                  "kind": "InlineFragment",
                  "typeCondition": "Furniture",
                  "selections": [
                    {
                      "kind": "Field",
                      "name": "__typename"
                    },
                    {
                      "kind": "Field",
                      "name": "upc"
                    }
                  ]
                }
              ],
              "variableUsages": [],
              "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{reviews{body}productReviews:reviews{body}}...on Furniture{reviews{body}productReviews:reviews{body}}}}"
            }
          }
        ]
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn aliases_supports_aliases_of_nested_fields_on_subservices() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetProduct($upc: String!) {
  product(upc: $upc) {
    name
    title: name
    reviews {
      content: body
      body
    }
    productReviews: reviews {
      body
      reviewer: author {
        name: username
      }
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "product",
        "variableUsages": [
          "upc"
        ],
        "operation": "query($upc:String!){product(upc:$upc){__typename ...on Book{__typename isbn}...on Furniture{name title:name __typename upc}}}"
      },
      {
        "kind": "Parallel",
        "nodes": [
          {
            "kind": "Sequence",
            "nodes": [
              {
                "kind": "Flatten",
                "path": [
                  "product"
                ],
                "node": {
                  "kind": "Fetch",
                  "serviceName": "books",
                  "requires": [
                    {
                      "kind": "InlineFragment",
                      "typeCondition": "Book",
                      "selections": [
                        {
                          "kind": "Field",
                          "name": "__typename"
                        },
                        {
                          "kind": "Field",
                          "name": "isbn"
                        }
                      ]
                    }
                  ],
                  "variableUsages": [],
                  "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{__typename isbn title year}}}"
                }
              },
              {
                "kind": "Flatten",
                "path": [
                  "product"
                ],
                "node": {
                  "kind": "Fetch",
                  "serviceName": "product",
                  "requires": [
                    {
                      "kind": "InlineFragment",
                      "typeCondition": "Book",
                      "selections": [
                        {
                          "kind": "Field",
                          "name": "__typename"
                        },
                        {
                          "kind": "Field",
                          "name": "isbn"
                        },
                        {
                          "kind": "Field",
                          "name": "title"
                        },
                        {
                          "kind": "Field",
                          "name": "year"
                        }
                      ]
                    }
                  ],
                  "variableUsages": [],
                  "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{name title:name}}}"
                }
              }
            ]
          },
          {
            "kind": "Flatten",
            "path": [
              "product"
            ],
            "node": {
              "kind": "Fetch",
              "serviceName": "reviews",
              "requires": [
                {
                  "kind": "InlineFragment",
                  "typeCondition": "Book",
                  "selections": [
                    {
                      "kind": "Field",
                      "name": "__typename"
                    },
                    {
                      "kind": "Field",
                      "name": "isbn"
                    }
                  ]
                },
                {
                  "kind": "InlineFragment",
                  "typeCondition": "Furniture",
                  "selections": [
                    {
                      "kind": "Field",
                      "name": "__typename"
                    },
                    {
                      "kind": "Field",
                      "name": "upc"
                    }
                  ]
                }
              ],
              "variableUsages": [],
              "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{reviews{content:body body}productReviews:reviews{body reviewer:author{name:username}}}...on Furniture{reviews{content:body body}productReviews:reviews{body reviewer:author{name:username}}}}}"
            }
          }
        ]
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn boolean_supports_skip_when_a_boolean_condition_is_met() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetReviewers {
  topReviews {
    body
    author @skip(if: true) {
      name
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "reviews",
        "variableUsages": [],
        "operation": "{topReviews{body author@skip(if:true){__typename id}}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "topReviews",
          "@",
          "author"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "accounts",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{name}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn boolean_supports_skip_when_a_boolean_condition_is_met_variable_driven() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetReviewers($skip: Boolean! = true) {
  topReviews {
    body
    author @skip(if: $skip) {
      username
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Fetch",
    "serviceName": "reviews",
    "variableUsages": [
      "skip"
    ],
    "operation": "query($skip:Boolean!=true){topReviews{body author@skip(if:$skip){username}}}"
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn boolean_supports_skip_when_a_boolean_condition_is_not_met() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetReviewers {
  topReviews {
    body
    author @skip(if: false) {
      name
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "reviews",
        "variableUsages": [],
        "operation": "{topReviews{body author@skip(if:false){__typename id}}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "topReviews",
          "@",
          "author"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "accounts",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{name}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn boolean_supports_skip_when_a_boolean_condition_is_not_met_variable_driven() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetReviewers($skip: Boolean!) {
  topReviews {
    body
    author @skip(if: $skip) {
      name
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "reviews",
        "variableUsages": [
          "skip"
        ],
        "operation": "query($skip:Boolean!){topReviews{body author@skip(if:$skip){__typename id}}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "topReviews",
          "@",
          "author"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "accounts",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{name}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn boolean_supports_include_when_a_boolean_condition_is_not_met() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetReviewers {
  topReviews {
    body
    author @include(if: false) {
      username
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Fetch",
    "serviceName": "reviews",
    "variableUsages": [],
    "operation": "{topReviews{body author@include(if:false){username}}}"
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn boolean_supports_include_when_a_boolean_condition_is_not_met_variable_driven() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetReviewers($include: Boolean! = false) {
  topReviews {
    body
    author @include(if: $include) {
      username
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Fetch",
    "serviceName": "reviews",
    "variableUsages": [
      "include"
    ],
    "operation": "query($include:Boolean!=false){topReviews{body author@include(if:$include){username}}}"
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn boolean_supports_include_when_a_boolean_condition_is_met() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetReviewers {
  topReviews {
    body
    author @include(if: true) {
      name
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "reviews",
        "variableUsages": [],
        "operation": "{topReviews{body author@include(if:true){__typename id}}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "topReviews",
          "@",
          "author"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "accounts",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{name}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn boolean_supports_include_when_a_boolean_condition_is_met_variable_driven() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetReviewers($include: Boolean!) {
  topReviews {
    body
    author @include(if: $include) {
      name
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "reviews",
        "variableUsages": [
          "include"
        ],
        "operation": "query($include:Boolean!){topReviews{body author@include(if:$include){__typename id}}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "topReviews",
          "@",
          "author"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "accounts",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{name}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_should_not_confuse_union_types_with_overlapping_field_names() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query {
  body {
    ...on Image {
      attributes {
        url
      }
    }
    ...on Text {
      attributes {
        bold
        text
      }
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Fetch",
    "serviceName": "documents",
    "variableUsages": [],
    "operation": "{body{__typename ...on Image{attributes{url}}...on Text{attributes{bold text}}}}"
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_should_use_a_single_fetch_when_requesting_a_root_field_from_one_service() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query {
  me {
    name
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Fetch",
    "serviceName": "accounts",
    "variableUsages": [],
    "operation": "{me{name}}"
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_should_use_two_independent_fetches_when_requesting_root_fields_from_two_services(
) {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query {
  me {
    name
  }
  topProducts {
    name
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Parallel",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "accounts",
        "variableUsages": [],
        "operation": "{me{name}}"
      },
      {
        "kind": "Sequence",
        "nodes": [
          {
            "kind": "Fetch",
            "serviceName": "product",
            "variableUsages": [],
            "operation": "{topProducts{__typename ...on Book{__typename isbn}...on Furniture{name}}}"
          },
          {
            "kind": "Flatten",
            "path": [
              "topProducts",
              "@"
            ],
            "node": {
              "kind": "Fetch",
              "serviceName": "books",
              "requires": [
                {
                  "kind": "InlineFragment",
                  "typeCondition": "Book",
                  "selections": [
                    {
                      "kind": "Field",
                      "name": "__typename"
                    },
                    {
                      "kind": "Field",
                      "name": "isbn"
                    }
                  ]
                }
              ],
              "variableUsages": [],
              "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{__typename isbn title year}}}"
            }
          },
          {
            "kind": "Flatten",
            "path": [
              "topProducts",
              "@"
            ],
            "node": {
              "kind": "Fetch",
              "serviceName": "product",
              "requires": [
                {
                  "kind": "InlineFragment",
                  "typeCondition": "Book",
                  "selections": [
                    {
                      "kind": "Field",
                      "name": "__typename"
                    },
                    {
                      "kind": "Field",
                      "name": "isbn"
                    },
                    {
                      "kind": "Field",
                      "name": "title"
                    },
                    {
                      "kind": "Field",
                      "name": "year"
                    }
                  ]
                }
              ],
              "variableUsages": [],
              "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{name}}}"
            }
          }
        ]
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_should_use_a_single_fetch_when_requesting_multiple_root_fields_from_the_same_service(
) {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query {
  topProducts {
    name
  }
  product(upc: "1") {
    name
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "product",
        "variableUsages": [],
        "operation": "{topProducts{__typename ...on Book{__typename isbn}...on Furniture{name}}product(upc:\"1\"){__typename ...on Book{__typename isbn}...on Furniture{name}}}"
      },
      {
        "kind": "Parallel",
        "nodes": [
          {
            "kind": "Sequence",
            "nodes": [
              {
                "kind": "Flatten",
                "path": [
                  "topProducts",
                  "@"
                ],
                "node": {
                  "kind": "Fetch",
                  "serviceName": "books",
                  "requires": [
                    {
                      "kind": "InlineFragment",
                      "typeCondition": "Book",
                      "selections": [
                        {
                          "kind": "Field",
                          "name": "__typename"
                        },
                        {
                          "kind": "Field",
                          "name": "isbn"
                        }
                      ]
                    }
                  ],
                  "variableUsages": [],
                  "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{__typename isbn title year}}}"
                }
              },
              {
                "kind": "Flatten",
                "path": [
                  "topProducts",
                  "@"
                ],
                "node": {
                  "kind": "Fetch",
                  "serviceName": "product",
                  "requires": [
                    {
                      "kind": "InlineFragment",
                      "typeCondition": "Book",
                      "selections": [
                        {
                          "kind": "Field",
                          "name": "__typename"
                        },
                        {
                          "kind": "Field",
                          "name": "isbn"
                        },
                        {
                          "kind": "Field",
                          "name": "title"
                        },
                        {
                          "kind": "Field",
                          "name": "year"
                        }
                      ]
                    }
                  ],
                  "variableUsages": [],
                  "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{name}}}"
                }
              }
            ]
          },
          {
            "kind": "Sequence",
            "nodes": [
              {
                "kind": "Flatten",
                "path": [
                  "product"
                ],
                "node": {
                  "kind": "Fetch",
                  "serviceName": "books",
                  "requires": [
                    {
                      "kind": "InlineFragment",
                      "typeCondition": "Book",
                      "selections": [
                        {
                          "kind": "Field",
                          "name": "__typename"
                        },
                        {
                          "kind": "Field",
                          "name": "isbn"
                        }
                      ]
                    }
                  ],
                  "variableUsages": [],
                  "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{__typename isbn title year}}}"
                }
              },
              {
                "kind": "Flatten",
                "path": [
                  "product"
                ],
                "node": {
                  "kind": "Fetch",
                  "serviceName": "product",
                  "requires": [
                    {
                      "kind": "InlineFragment",
                      "typeCondition": "Book",
                      "selections": [
                        {
                          "kind": "Field",
                          "name": "__typename"
                        },
                        {
                          "kind": "Field",
                          "name": "isbn"
                        },
                        {
                          "kind": "Field",
                          "name": "title"
                        },
                        {
                          "kind": "Field",
                          "name": "year"
                        }
                      ]
                    }
                  ],
                  "variableUsages": [],
                  "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{name}}}"
                }
              }
            ]
          }
        ]
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_should_use_a_single_fetch_when_requesting_relationship_subfields_from_the_same_service(
) {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query {
  topReviews {
    body
    author {
      reviews {
        body
      }
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Fetch",
    "serviceName": "reviews",
    "variableUsages": [],
    "operation": "{topReviews{body author{reviews{body}}}}"
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_should_use_a_single_fetch_when_requesting_relationship_subfields_and_provided_keys_from_the_same_service(
) {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query {
  topReviews {
    body
    author {
      id
      reviews {
        body
      }
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Fetch",
    "serviceName": "reviews",
    "variableUsages": [],
    "operation": "{topReviews{body author{id reviews{body}}}}"
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_when_requesting_an_extension_field_from_another_service_it_should_add_the_fields_representation_requirements_to_the_parent_selection_set_and_use_a_dependent_fetch(
) {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query {
  me {
    name
    reviews {
      body
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "accounts",
        "variableUsages": [],
        "operation": "{me{name __typename id}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "me"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "reviews",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{body}}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_when_requesting_an_extension_field_from_another_service_when_the_parent_selection_set_is_empty_should_add_the_fields_requirements_to_the_parent_selection_set_and_use_a_dependent_fetch(
) {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query {
  me {
    reviews {
      body
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "accounts",
        "variableUsages": [],
        "operation": "{me{__typename id}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "me"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "reviews",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{body}}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_when_requesting_an_extension_field_from_another_service_should_only_add_requirements_once(
) {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query {
  me {
    reviews {
      body
    }
    numberOfReviews
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "accounts",
        "variableUsages": [],
        "operation": "{me{__typename id}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "me"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "reviews",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{body}numberOfReviews}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_when_requesting_a_composite_field_with_subfields_from_another_service_it_should_add_key_fields_to_the_parent_selection_set_and_use_a_dependent_fetch(
) {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query {
  topReviews {
    body
    author {
      name
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "reviews",
        "variableUsages": [],
        "operation": "{topReviews{body author{__typename id}}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "topReviews",
          "@",
          "author"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "accounts",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{name}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_when_requesting_a_composite_field_with_subfields_from_another_service_when_requesting_a_field_defined_in_another_service_which_requires_a_field_in_the_base_service_it_should_add_the_field_provided_by_base_service_in_first_fetch(
) {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query {
  topCars {
    retailPrice
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "product",
        "variableUsages": [],
        "operation": "{topCars{__typename id price}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "topCars",
          "@"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "reviews",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "Car",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                },
                {
                  "kind": "Field",
                  "name": "price"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Car{retailPrice}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_when_requesting_a_composite_field_with_subfields_from_another_service_when_the_parent_selection_set_is_empty_it_should_add_key_fields_to_the_parent_selection_set_and_use_a_dependent_fetch(
) {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query {
  topReviews {
    author {
      name
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "reviews",
        "variableUsages": [],
        "operation": "{topReviews{author{__typename id}}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "topReviews",
          "@",
          "author"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "accounts",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{name}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_when_requesting_a_relationship_field_with_extension_subfields_from_a_different_service_it_should_first_fetch_the_object_using_a_key_from_the_base_service_and_then_pass_through_the_requirements(
) {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query {
  topReviews {
    author {
      birthDate
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "reviews",
        "variableUsages": [],
        "operation": "{topReviews{author{__typename id}}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "topReviews",
          "@",
          "author"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "accounts",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{birthDate}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_for_abstract_types_it_should_add___typename_when_fetching_objects_of_an_interface_type_from_a_service(
) {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query {
  topProducts {
    price
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Fetch",
    "serviceName": "product",
    "variableUsages": [],
    "operation": "{topProducts{__typename ...on Book{price}...on Furniture{price}}}"
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_should_break_up_when_traversing_an_extension_field_on_an_interface_type_from_a_service(
) {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query {
  topProducts {
    price
    reviews {
      body
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "product",
        "variableUsages": [],
        "operation": "{topProducts{__typename ...on Book{price __typename isbn}...on Furniture{price __typename upc}}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "topProducts",
          "@"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "reviews",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "Book",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "isbn"
                }
              ]
            },
            {
              "kind": "InlineFragment",
              "typeCondition": "Furniture",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "upc"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{reviews{body}}...on Furniture{reviews{body}}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_interface_fragments_should_expand_into_possible_types_only() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query {
  books {
    ... on Product {
      name
      ... on Furniture {
        upc
      }
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "books",
        "variableUsages": [],
        "operation": "{books{__typename isbn title year}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "books",
          "@"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "product",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "Book",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "isbn"
                },
                {
                  "kind": "Field",
                  "name": "title"
                },
                {
                  "kind": "Field",
                  "name": "year"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{name}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_interface_inside_interface_should_expand_into_possible_types_only() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query {
  product(upc: "") {
    details {
      country
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Fetch",
    "serviceName": "product",
    "variableUsages": [],
    "operation": "{product(upc:\"\"){__typename ...on Book{details{country}}...on Furniture{details{country}}}}"
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_experimental_compression_to_downstream_services_should_generate_fragments_internally_to_downstream_requests(
) {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query {
  topReviews {
    body
    author
    product {
      name
      price
      details {
        country
      }
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: true
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "reviews",
        "variableUsages": [],
        "operation": "{topReviews{...__QueryPlanFragment_1__}}fragment __QueryPlanFragment_0__ on Product{__typename ...on Book{__typename isbn}...on Furniture{__typename upc}}fragment __QueryPlanFragment_1__ on Review{body author product{...__QueryPlanFragment_0__}}"
      },
      {
        "kind": "Parallel",
        "nodes": [
          {
            "kind": "Sequence",
            "nodes": [
              {
                "kind": "Flatten",
                "path": [
                  "topReviews",
                  "@",
                  "product"
                ],
                "node": {
                  "kind": "Fetch",
                  "serviceName": "books",
                  "requires": [
                    {
                      "kind": "InlineFragment",
                      "typeCondition": "Book",
                      "selections": [
                        {
                          "kind": "Field",
                          "name": "__typename"
                        },
                        {
                          "kind": "Field",
                          "name": "isbn"
                        }
                      ]
                    }
                  ],
                  "variableUsages": [],
                  "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{__typename isbn title year}}}"
                }
              },
              {
                "kind": "Flatten",
                "path": [
                  "topReviews",
                  "@",
                  "product"
                ],
                "node": {
                  "kind": "Fetch",
                  "serviceName": "product",
                  "requires": [
                    {
                      "kind": "InlineFragment",
                      "typeCondition": "Book",
                      "selections": [
                        {
                          "kind": "Field",
                          "name": "__typename"
                        },
                        {
                          "kind": "Field",
                          "name": "isbn"
                        },
                        {
                          "kind": "Field",
                          "name": "title"
                        },
                        {
                          "kind": "Field",
                          "name": "year"
                        }
                      ]
                    }
                  ],
                  "variableUsages": [],
                  "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{name}}}"
                }
              }
            ]
          },
          {
            "kind": "Flatten",
            "path": [
              "topReviews",
              "@",
              "product"
            ],
            "node": {
              "kind": "Fetch",
              "serviceName": "product",
              "requires": [
                {
                  "kind": "InlineFragment",
                  "typeCondition": "Furniture",
                  "selections": [
                    {
                      "kind": "Field",
                      "name": "__typename"
                    },
                    {
                      "kind": "Field",
                      "name": "upc"
                    }
                  ]
                },
                {
                  "kind": "InlineFragment",
                  "typeCondition": "Book",
                  "selections": [
                    {
                      "kind": "Field",
                      "name": "__typename"
                    },
                    {
                      "kind": "Field",
                      "name": "isbn"
                    }
                  ]
                }
              ],
              "variableUsages": [],
              "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Furniture{name price details{country}}...on Book{price details{country}}}}"
            }
          }
        ]
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_experimental_compression_to_downstream_services_shouldnt_generate_fragments_for_selection_sets_of_length_2_or_less(
) {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query {
  topReviews {
    body
    author
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: true
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Fetch",
    "serviceName": "reviews",
    "variableUsages": [],
    "operation": "{topReviews{body author}}"
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_experimental_compression_to_downstream_services_should_generate_fragments_for_selection_sets_of_length_3_or_greater(
) {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query {
  topReviews {
    id
    body
    author
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: true
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Fetch",
    "serviceName": "reviews",
    "variableUsages": [],
    "operation": "{topReviews{...__QueryPlanFragment_0__}}fragment __QueryPlanFragment_0__ on Review{id body author}"
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_experimental_compression_to_downstream_services_should_generate_fragments_correctly_when_aliases_are_used(
) {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query {
  reviews: topReviews {
    content: body
    author
    product {
      name
      cost: price
      details {
        origin: country
      }
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: true
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "reviews",
        "variableUsages": [],
        "operation": "{reviews:topReviews{...__QueryPlanFragment_1__}}fragment __QueryPlanFragment_0__ on Product{__typename ...on Book{__typename isbn}...on Furniture{__typename upc}}fragment __QueryPlanFragment_1__ on Review{content:body author product{...__QueryPlanFragment_0__}}"
      },
      {
        "kind": "Parallel",
        "nodes": [
          {
            "kind": "Sequence",
            "nodes": [
              {
                "kind": "Flatten",
                "path": [
                  "reviews",
                  "@",
                  "product"
                ],
                "node": {
                  "kind": "Fetch",
                  "serviceName": "books",
                  "requires": [
                    {
                      "kind": "InlineFragment",
                      "typeCondition": "Book",
                      "selections": [
                        {
                          "kind": "Field",
                          "name": "__typename"
                        },
                        {
                          "kind": "Field",
                          "name": "isbn"
                        }
                      ]
                    }
                  ],
                  "variableUsages": [],
                  "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{__typename isbn title year}}}"
                }
              },
              {
                "kind": "Flatten",
                "path": [
                  "reviews",
                  "@",
                  "product"
                ],
                "node": {
                  "kind": "Fetch",
                  "serviceName": "product",
                  "requires": [
                    {
                      "kind": "InlineFragment",
                      "typeCondition": "Book",
                      "selections": [
                        {
                          "kind": "Field",
                          "name": "__typename"
                        },
                        {
                          "kind": "Field",
                          "name": "isbn"
                        },
                        {
                          "kind": "Field",
                          "name": "title"
                        },
                        {
                          "kind": "Field",
                          "name": "year"
                        }
                      ]
                    }
                  ],
                  "variableUsages": [],
                  "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{name}}}"
                }
              }
            ]
          },
          {
            "kind": "Flatten",
            "path": [
              "reviews",
              "@",
              "product"
            ],
            "node": {
              "kind": "Fetch",
              "serviceName": "product",
              "requires": [
                {
                  "kind": "InlineFragment",
                  "typeCondition": "Furniture",
                  "selections": [
                    {
                      "kind": "Field",
                      "name": "__typename"
                    },
                    {
                      "kind": "Field",
                      "name": "upc"
                    }
                  ]
                },
                {
                  "kind": "InlineFragment",
                  "typeCondition": "Book",
                  "selections": [
                    {
                      "kind": "Field",
                      "name": "__typename"
                    },
                    {
                      "kind": "Field",
                      "name": "isbn"
                    }
                  ]
                }
              ],
              "variableUsages": [],
              "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Furniture{name cost:price details{origin:country}}...on Book{cost:price details{origin:country}}}}"
            }
          }
        ]
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_should_properly_expand_nested_unions_with_inline_fragments() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query {
  body {
    ... on Image {
      ... on Body {
        ... on Image {
          attributes {
            url
          }
        }
        ... on Text {
          attributes {
            bold
            text
          }
        }
      }
    }
    ... on Text {
      attributes {
        bold
      }
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Fetch",
    "serviceName": "documents",
    "variableUsages": [],
    "operation": "{body{__typename ...on Image{attributes{url}}...on Text{attributes{bold}}}}"
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_deduplicates_fields__selections_regardless_of_adjacency_and_type_condition_nesting_for_inline_fragments(
) {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query {
  body {
    ... on Image {
      ... on Text {
        attributes {
          bold
        }
      }
    }
    ... on Body {
      ... on Text {
        attributes {
          bold
          text
        }
      }
    }
    ... on Text {
      attributes {
        bold
        text
      }
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Fetch",
    "serviceName": "documents",
    "variableUsages": [],
    "operation": "{body{__typename ...on Text{attributes{bold text}}}}"
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_deduplicates_fields__selections_regardless_of_adjacency_and_type_condition_nesting_for_named_fragment_spreads(
) {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
fragment TextFragment on Text {
  attributes {
    bold
    text
  }
}

query {
  body {
    ... on Image {
      ...TextFragment
    }
    ... on Body {
      ...TextFragment
    }
    ...TextFragment
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Fetch",
    "serviceName": "documents",
    "variableUsages": [],
    "operation": "{body{__typename ...on Text{attributes{bold text}}}}"
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_supports_basic_single_service_mutation() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
mutation Login($username: String!, $password: String!) {
  login(username: $username, password: $password) {
    id
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Fetch",
    "serviceName": "accounts",
    "variableUsages": [
      "username",
      "password"
    ],
    "operation": "mutation($username:String!$password:String!){login(username:$username password:$password){id}}"
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_supports_mutations_with_a_cross_service_request() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
mutation Login($username: String!, $password: String!) {
  login(username: $username, password: $password) {
    reviews {
      product {
        upc
      }
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "accounts",
        "variableUsages": [
          "username",
          "password"
        ],
        "operation": "mutation($username:String!$password:String!){login(username:$username password:$password){__typename id}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "login"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "reviews",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{product{__typename ...on Book{__typename isbn}...on Furniture{upc}}}}}}"
        }
      },
      {
        "kind": "Flatten",
        "path": [
          "login",
          "reviews",
          "@",
          "product"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "product",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "Book",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "isbn"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{upc}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_returning_across_service_boundaries() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
mutation Review($upc: String!, $body: String!) {
  reviewProduct(upc: $upc, body: $body) {
    ... on Furniture {
      name
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "reviews",
        "variableUsages": [
          "upc",
          "body"
        ],
        "operation": "mutation($upc:String!$body:String!){reviewProduct(upc:$upc body:$body){__typename ...on Furniture{__typename upc}}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "reviewProduct"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "product",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "Furniture",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "upc"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Furniture{name}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_supports_multiple_root_mutations() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
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
  reviewProduct(upc: $upc, body: $body) {
    ... on Furniture {
      name
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "accounts",
        "variableUsages": [
          "username",
          "password"
        ],
        "operation": "mutation($username:String!$password:String!){login(username:$username password:$password){__typename id}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "login"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "reviews",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{product{__typename ...on Book{__typename isbn}...on Furniture{upc}}}}}}"
        }
      },
      {
        "kind": "Flatten",
        "path": [
          "login",
          "reviews",
          "@",
          "product"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "product",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "Book",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "isbn"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{upc}}}"
        }
      },
      {
        "kind": "Fetch",
        "serviceName": "reviews",
        "variableUsages": [
          "upc",
          "body"
        ],
        "operation": "mutation($upc:String!$body:String!){reviewProduct(upc:$upc body:$body){__typename ...on Furniture{__typename upc}}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "reviewProduct"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "product",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "Furniture",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "upc"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Furniture{name}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_multiple_root_mutations_with_correct_service_order() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
mutation LoginAndReview(
  $upc: String!
  $body: String!
  $updatedReview: UpdateReviewInput!
  $username: String!
  $password: String!
  $reviewId: ID!
) {
  reviewProduct(upc: $upc, body: $body) {
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
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "reviews",
        "variableUsages": [
          "upc",
          "body",
          "updatedReview"
        ],
        "operation": "mutation($upc:String!$body:String!$updatedReview:UpdateReviewInput!){reviewProduct(upc:$upc body:$body){__typename ...on Furniture{upc}}updateReview(review:$updatedReview){id body}}"
      },
      {
        "kind": "Fetch",
        "serviceName": "accounts",
        "variableUsages": [
          "username",
          "password"
        ],
        "operation": "mutation($username:String!$password:String!){login(username:$username password:$password){__typename id}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "login"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "reviews",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{product{__typename ...on Book{__typename isbn}...on Furniture{upc}}}}}}"
        }
      },
      {
        "kind": "Flatten",
        "path": [
          "login",
          "reviews",
          "@",
          "product"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "product",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "Book",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "isbn"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{upc}}}"
        }
      },
      {
        "kind": "Fetch",
        "serviceName": "reviews",
        "variableUsages": [
          "reviewId"
        ],
        "operation": "mutation($reviewId:ID!){deleteReview(id:$reviewId)}"
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn build_query_plan_supports_arrays() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query MergeArrays {
  me {
    # goodAddress
    goodDescription
    metadata {
      address
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "accounts",
        "variableUsages": [],
        "operation": "{me{__typename id metadata{description address}}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "me"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "inventory",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                },
                {
                  "kind": "Field",
                  "name": "metadata",
                  "selections": [
                    {
                      "kind": "Field",
                      "name": "description"
                    }
                  ]
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{goodDescription}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn custom_directives_successfully_passes_directives_along_in_requests_to_an_underlying_service() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetReviewers {
  topReviews {
    body @stream
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Fetch",
    "serviceName": "reviews",
    "variableUsages": [],
    "operation": "{topReviews{body@stream}}"
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn custom_directives_successfully_passes_directives_and_their_variables_along_in_requests_to_underlying_services(
) {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetReviewers {
  topReviews {
    body @stream
    author @transform(from: "JSON") {
      name @stream
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "reviews",
        "variableUsages": [],
        "operation": "{topReviews{body@stream author@transform(from:\"JSON\"){__typename id}}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "topReviews",
          "@",
          "author"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "accounts",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{name@stream}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn execution_style_supports_parallel_root_fields() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetUserAndReviews {
  me {
    username
  }
  topReviews {
    body
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Parallel",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "accounts",
        "variableUsages": [],
        "operation": "{me{username}}"
      },
      {
        "kind": "Fetch",
        "serviceName": "reviews",
        "variableUsages": [],
        "operation": "{topReviews{body}}"
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn fragments_supports_inline_fragments_one_level() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetUser {
  me {
    ... on User {
      username
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Fetch",
    "serviceName": "accounts",
    "variableUsages": [],
    "operation": "{me{username}}"
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn fragments_supports_inline_fragments_multi_level() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetUser {
  me {
    ... on User {
      username
      reviews {
        ... on Review {
          body
          product {
            ... on Product {
              ... on Book {
                title
              }
              ... on Furniture {
                name
              }
            }
          }
        }
      }
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "accounts",
        "variableUsages": [],
        "operation": "{me{username __typename id}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "me"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "reviews",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{body product{__typename ...on Book{__typename isbn}...on Furniture{__typename upc}}}}}}"
        }
      },
      {
        "kind": "Parallel",
        "nodes": [
          {
            "kind": "Flatten",
            "path": [
              "me",
              "reviews",
              "@",
              "product"
            ],
            "node": {
              "kind": "Fetch",
              "serviceName": "books",
              "requires": [
                {
                  "kind": "InlineFragment",
                  "typeCondition": "Book",
                  "selections": [
                    {
                      "kind": "Field",
                      "name": "__typename"
                    },
                    {
                      "kind": "Field",
                      "name": "isbn"
                    }
                  ]
                }
              ],
              "variableUsages": [],
              "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{title}}}"
            }
          },
          {
            "kind": "Flatten",
            "path": [
              "me",
              "reviews",
              "@",
              "product"
            ],
            "node": {
              "kind": "Fetch",
              "serviceName": "product",
              "requires": [
                {
                  "kind": "InlineFragment",
                  "typeCondition": "Furniture",
                  "selections": [
                    {
                      "kind": "Field",
                      "name": "__typename"
                    },
                    {
                      "kind": "Field",
                      "name": "upc"
                    }
                  ]
                }
              ],
              "variableUsages": [],
              "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Furniture{name}}}"
            }
          }
        ]
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn fragments_supports_named_fragments_one_level() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetUser {
  me {
    ...userDetails
  }
}

fragment userDetails on User {
  username
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Fetch",
    "serviceName": "accounts",
    "variableUsages": [],
    "operation": "{me{username}}"
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn fragments_supports_multiple_named_fragments_one_level_mixed_ordering() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
fragment userInfo on User {
  name
}
query GetUser {
  me {
    ...userDetails
    ...userInfo
  }
}

fragment userDetails on User {
  username
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Fetch",
    "serviceName": "accounts",
    "variableUsages": [],
    "operation": "{me{username name}}"
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn fragments_supports_multiple_named_fragments_multi_level_mixed_ordering() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
fragment reviewDetails on Review {
  body
}
query GetUser {
  me {
    ...userDetails
  }
}

fragment userDetails on User {
  username
  reviews {
    ...reviewDetails
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "accounts",
        "variableUsages": [],
        "operation": "{me{username __typename id}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "me"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "reviews",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{body}}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn fragments_supports_variables_within_fragments() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetUser($format: Boolean) {
  me {
    ...userDetails
  }
}

fragment userDetails on User {
  username
  reviews {
    body(format: $format)
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "accounts",
        "variableUsages": [],
        "operation": "{me{username __typename id}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "me"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "reviews",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                }
              ]
            }
          ],
          "variableUsages": [
            "format"
          ],
          "operation": "query($representations:[_Any!]!$format:Boolean){_entities(representations:$representations){...on User{reviews{body(format:$format)}}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn fragments_supports_root_fragments() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetUser {
  ... on Query {
    me {
      username
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Fetch",
    "serviceName": "accounts",
    "variableUsages": [],
    "operation": "{me{username}}"
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn fragments_supports_directives_on_inline_fragments_httpsgithubcomapollographqlfederationissues177(
) {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetVehicle {
  vehicle(id:"rav4") {
    ... on Car @fragmentDirective {
      price        
    }
    ... on Van {
      price @fieldDirective
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r###"
    {
      "kind": "QueryPlan",
      "node": {
        "kind": "Fetch",
        "serviceName": "product",
        "variableUsages": [],
        "operation": "{vehicle(id:\"rav4\"){__typename ...on Car@fragmentDirective{price}...on Van{price@fieldDirective}}}"
      }
    }
    "###
    );
}

#[allow(non_snake_case)]
#[test]
fn introspection_can_execute_schema_introspection_query() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query IntrospectionQuery {
  __schema {
    queryType {
      name
    }
    mutationType {
      name
    }
    subscriptionType {
      name
    }
    types {
      ...FullType
    }
    directives {
      name
      description
      locations
      args {
        ...InputValue
      }
    }
  }
}
fragment FullType on __Type {
  kind
  name
  description
  fields(includeDeprecated: true) {
    name
    description
    args {
      ...InputValue
    }
    type {
      ...TypeRef
    }
    isDeprecated
    deprecationReason
  }
  inputFields {
    ...InputValue
  }
  interfaces {
    ...TypeRef
  }
  enumValues(includeDeprecated: true) {
    name
    description
    isDeprecated
    deprecationReason
  }
  possibleTypes {
    ...TypeRef
  }
}
fragment InputValue on __InputValue {
  name
  description
  type {
    ...TypeRef
  }
  defaultValue
}
fragment TypeRef on __Type {
  kind
  name
  ofType {
    kind
    name
    ofType {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
              }
            }
          }
        }
      }
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r###"
    {
      "kind": "QueryPlan",
      "node": null
    }
    "###
    );
}

#[allow(non_snake_case)]
#[test]
fn introspection_can_execute_type_introspection_query() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query($foo:String!) {
  __type(name:$foo) {
    enumValues{ __typename name }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r###"
    {
      "kind": "QueryPlan",
      "node": null
    }
    "###
    );
}

#[allow(non_snake_case)]
#[test]
fn mutations_supports_mutations() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
mutation Login($username: String!, $password: String!) {
  login(username: $username, password: $password) {
    reviews {
      product {
        upc
      }
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "accounts",
        "variableUsages": [
          "username",
          "password"
        ],
        "operation": "mutation($username:String!$password:String!){login(username:$username password:$password){__typename id}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "login"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "reviews",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{product{__typename ...on Book{__typename isbn}...on Furniture{upc}}}}}}"
        }
      },
      {
        "kind": "Flatten",
        "path": [
          "login",
          "reviews",
          "@",
          "product"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "product",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "Book",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "isbn"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{upc}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn mutations_mutations_across_service_boundaries() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
mutation Review($upc: String!, $body: String!) {
  reviewProduct(upc: $upc, body: $body) {
    ... on Furniture {
      name
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "reviews",
        "variableUsages": [
          "upc",
          "body"
        ],
        "operation": "mutation($upc:String!$body:String!){reviewProduct(upc:$upc body:$body){__typename ...on Furniture{__typename upc}}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "reviewProduct"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "product",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "Furniture",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "upc"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Furniture{name}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn mutations_multiple_root_mutations() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
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
  reviewProduct(upc: $upc, body: $body) {
    ... on Furniture {
      name
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "accounts",
        "variableUsages": [
          "username",
          "password"
        ],
        "operation": "mutation($username:String!$password:String!){login(username:$username password:$password){__typename id}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "login"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "reviews",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{product{__typename ...on Book{__typename isbn}...on Furniture{upc}}}}}}"
        }
      },
      {
        "kind": "Flatten",
        "path": [
          "login",
          "reviews",
          "@",
          "product"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "product",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "Book",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "isbn"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{upc}}}"
        }
      },
      {
        "kind": "Fetch",
        "serviceName": "reviews",
        "variableUsages": [
          "upc",
          "body"
        ],
        "operation": "mutation($upc:String!$body:String!){reviewProduct(upc:$upc body:$body){__typename ...on Furniture{__typename upc}}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "reviewProduct"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "product",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "Furniture",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "upc"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Furniture{name}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn mutations_multiple_root_mutations_with_correct_service_order() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
mutation LoginAndReview(
  $upc: String!
  $body: String!
  $updatedReview: UpdateReviewInput!
  $username: String!
  $password: String!
  $reviewId: ID!
) {
  reviewProduct(upc: $upc, body: $body) {
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
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "reviews",
        "variableUsages": [
          "upc",
          "body",
          "updatedReview"
        ],
        "operation": "mutation($upc:String!$body:String!$updatedReview:UpdateReviewInput!){reviewProduct(upc:$upc body:$body){__typename ...on Furniture{upc}}updateReview(review:$updatedReview){id body}}"
      },
      {
        "kind": "Fetch",
        "serviceName": "accounts",
        "variableUsages": [
          "username",
          "password"
        ],
        "operation": "mutation($username:String!$password:String!){login(username:$username password:$password){__typename id}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "login"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "reviews",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{product{__typename ...on Book{__typename isbn}...on Furniture{upc}}}}}}"
        }
      },
      {
        "kind": "Flatten",
        "path": [
          "login",
          "reviews",
          "@",
          "product"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "product",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "Book",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "isbn"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{upc}}}"
        }
      },
      {
        "kind": "Fetch",
        "serviceName": "reviews",
        "variableUsages": [
          "reviewId"
        ],
        "operation": "mutation($reviewId:ID!){deleteReview(id:$reviewId)}"
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn provides_does_not_have_to_go_to_another_service_when_field_is_given() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetReviewers {
  topReviews {
    author {
      username
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Fetch",
    "serviceName": "reviews",
    "variableUsages": [],
    "operation": "{topReviews{author{username}}}"
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn provides_does_not_load_fields_provided_even_when_going_to_other_service() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetReviewers {
  topReviews {
    author {
      username
      name
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "reviews",
        "variableUsages": [],
        "operation": "{topReviews{author{username __typename id}}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "topReviews",
          "@",
          "author"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "accounts",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{name}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn requires_supports_passing_additional_fields_defined_by_a_requires() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetReviwedBookNames {
  me {
    reviews {
      product {
        ... on Book {
          name
        }
      }
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "accounts",
        "variableUsages": [],
        "operation": "{me{__typename id}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "me"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "reviews",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{product{__typename ...on Book{__typename isbn}}}}}}"
        }
      },
      {
        "kind": "Flatten",
        "path": [
          "me",
          "reviews",
          "@",
          "product"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "books",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "Book",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "isbn"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{__typename isbn title year}}}"
        }
      },
      {
        "kind": "Flatten",
        "path": [
          "me",
          "reviews",
          "@",
          "product"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "product",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "Book",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "isbn"
                },
                {
                  "kind": "Field",
                  "name": "title"
                },
                {
                  "kind": "Field",
                  "name": "year"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{name}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn single_service_does_not_remove___typename_on_root_types() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetUser {
  __typename
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r###"
    {
      "kind": "QueryPlan",
      "node": null
    }
    "###
    );
}

#[allow(non_snake_case)]
#[test]
fn single_service_does_not_remove___typename_if_that_is_all_that_is_requested_on_an_entity() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetUser {
  me {
    __typename
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Fetch",
    "serviceName": "accounts",
    "variableUsages": [],
    "operation": "{me{__typename}}"
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn single_service_does_not_remove___typename_if_that_is_all_that_is_requested_on_a_value_type() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetUser {
  me {
    account {
      __typename
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Fetch",
    "serviceName": "accounts",
    "variableUsages": [],
    "operation": "{me{account{__typename}}}"
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn value_types_resolves_value_types_within_their_respective_services() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
fragment Metadata on MetadataOrError {
  ... on KeyValue {
    key
    value
  }
  ... on Error {
    code
    message
  }
}

query ProducsWithMetadata {
  topProducts(first: 10) {
    upc
    ... on Book {
      metadata {
        ...Metadata
      }
    }
    ... on Furniture {
      metadata {
        ...Metadata
      }
    }
    reviews {
      metadata {
        ...Metadata
      }
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "product",
        "variableUsages": [],
        "operation": "{topProducts(first:10){__typename ...on Book{upc __typename isbn}...on Furniture{upc metadata{__typename ...on KeyValue{key value}...on Error{code message}}__typename}}}"
      },
      {
        "kind": "Parallel",
        "nodes": [
          {
            "kind": "Flatten",
            "path": [
              "topProducts",
              "@"
            ],
            "node": {
              "kind": "Fetch",
              "serviceName": "books",
              "requires": [
                {
                  "kind": "InlineFragment",
                  "typeCondition": "Book",
                  "selections": [
                    {
                      "kind": "Field",
                      "name": "__typename"
                    },
                    {
                      "kind": "Field",
                      "name": "isbn"
                    }
                  ]
                }
              ],
              "variableUsages": [],
              "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{metadata{__typename ...on KeyValue{key value}...on Error{code message}}}}}"
            }
          },
          {
            "kind": "Flatten",
            "path": [
              "topProducts",
              "@"
            ],
            "node": {
              "kind": "Fetch",
              "serviceName": "reviews",
              "requires": [
                {
                  "kind": "InlineFragment",
                  "typeCondition": "Book",
                  "selections": [
                    {
                      "kind": "Field",
                      "name": "__typename"
                    },
                    {
                      "kind": "Field",
                      "name": "isbn"
                    }
                  ]
                },
                {
                  "kind": "InlineFragment",
                  "typeCondition": "Furniture",
                  "selections": [
                    {
                      "kind": "Field",
                      "name": "__typename"
                    },
                    {
                      "kind": "Field",
                      "name": "upc"
                    }
                  ]
                }
              ],
              "variableUsages": [],
              "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{reviews{metadata{__typename ...on KeyValue{key value}...on Error{code message}}}}...on Furniture{reviews{metadata{__typename ...on KeyValue{key value}...on Error{code message}}}}}}"
            }
          }
        ]
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn variables_passes_variables_to_root_fields() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetProduct($upc: String!) {
  product(upc: $upc) {
    name
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "product",
        "variableUsages": [
          "upc"
        ],
        "operation": "query($upc:String!){product(upc:$upc){__typename ...on Book{__typename isbn}...on Furniture{name}}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "product"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "books",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "Book",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "isbn"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{__typename isbn title year}}}"
        }
      },
      {
        "kind": "Flatten",
        "path": [
          "product"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "product",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "Book",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "isbn"
                },
                {
                  "kind": "Field",
                  "name": "title"
                },
                {
                  "kind": "Field",
                  "name": "year"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{name}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn variables_supports_default_variables_in_a_variable_definition() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetProduct($upc: String = "1") {
  product(upc: $upc) {
    name
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "product",
        "variableUsages": [
          "upc"
        ],
        "operation": "query($upc:String=\"1\"){product(upc:$upc){__typename ...on Book{__typename isbn}...on Furniture{name}}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "product"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "books",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "Book",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "isbn"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{__typename isbn title year}}}"
        }
      },
      {
        "kind": "Flatten",
        "path": [
          "product"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "product",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "Book",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "isbn"
                },
                {
                  "kind": "Field",
                  "name": "title"
                },
                {
                  "kind": "Field",
                  "name": "year"
                }
              ]
            }
          ],
          "variableUsages": [],
          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{name}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn variables_passes_variables_to_nested_services() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query GetProductsForUser($format: Boolean) {
  me {
    reviews {
      body(format: $format)
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "accounts",
        "variableUsages": [],
        "operation": "{me{__typename id}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "me"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "reviews",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "User",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                }
              ]
            }
          ],
          "variableUsages": [
            "format"
          ],
          "operation": "query($representations:[_Any!]!$format:Boolean){_entities(representations:$representations){...on User{reviews{body(format:$format)}}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn variables_works_with_default_variables_in_the_schema() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query LibraryUser($libraryId: ID!, $userId: ID) {
  library(id: $libraryId) {
    userAccount(id: $userId) {
      id
      name
    }
  }
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Sequence",
    "nodes": [
      {
        "kind": "Fetch",
        "serviceName": "books",
        "variableUsages": [
          "libraryId"
        ],
        "operation": "query($libraryId:ID!){library(id:$libraryId){__typename id name}}"
      },
      {
        "kind": "Flatten",
        "path": [
          "library"
        ],
        "node": {
          "kind": "Fetch",
          "serviceName": "accounts",
          "requires": [
            {
              "kind": "InlineFragment",
              "typeCondition": "Library",
              "selections": [
                {
                  "kind": "Field",
                  "name": "__typename"
                },
                {
                  "kind": "Field",
                  "name": "id"
                },
                {
                  "kind": "Field",
                  "name": "name"
                }
              ]
            }
          ],
          "variableUsages": [
            "userId"
          ],
          "operation": "query($representations:[_Any!]!$userId:ID){_entities(representations:$representations){...on Library{userAccount(id:$userId){id name}}}}"
        }
      }
    ]
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn variables_string_arguments_with_quotes_that_need_to_be_escaped() {
    assert_snapshot!(
        plan(
            include_str!("basic/schema.graphql"),
            r##"
query {
 vehicle(id: "{\"make\":\"Toyota\",\"model\":\"Rav4\",\"trim\":\"Limited\"}")
}
"##,
            QueryPlanningOptions {
                auto_fragmentization: false
            }
        ),
        @r##"{
  "kind": "QueryPlan",
  "node": {
    "kind": "Fetch",
    "serviceName": "product",
    "variableUsages": [],
    "operation": "{vehicle(id:\"{\\\"make\\\":\\\"Toyota\\\",\\\"model\\\":\\\"Rav4\\\",\\\"trim\\\":\\\"Limited\\\"}\"){__typename}}"
  }
}"##
    );
}
