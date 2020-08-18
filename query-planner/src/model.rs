//! This is the model object for a QueryPlan trimmed down to only contain _owned_ fields
//! that are required for executing a QueryPlan as implemented in the existing Apollo Gateway.
//!
//! The [SelectionSet] in the `requires` field of a [FetchNode] is trimmed to only be a list of
//! either a [Field] or an [InlineFragment], since those are the only potential values needed to
//! execute a query plan. Furthermore, within a [Field] or [InlineFragment], we only need
//! names, aliases, type conditions, and recurively sub [SelectionSet]s.

use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(from = "QueryPlanSerde", into = "QueryPlanSerde")]
pub struct QueryPlan {
    pub node: Option<PlanNode>,
}

impl From<QueryPlanSerde> for QueryPlan {
    fn from(qps: QueryPlanSerde) -> Self {
        let QueryPlanSerde::QueryPlan { node } = qps;
        QueryPlan { node }
    }
}

impl Into<QueryPlanSerde> for QueryPlan {
    fn into(self) -> QueryPlanSerde {
        QueryPlanSerde::QueryPlan { node: self.node }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase", tag = "kind")]
pub enum PlanNode {
    Sequence { nodes: Vec<PlanNode> },
    Parallel { nodes: Vec<PlanNode> },
    Fetch(FetchNode),
    Flatten(FlattenNode),
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchNode {
    pub service_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requires: Option<SelectionSet>,
    pub variable_usages: Vec<String>,
    pub operation: GraphQLDocument,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlattenNode {
    pub path: Vec<ResponsePathElement>,
    pub node: Box<PlanNode>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase", tag = "kind")]
pub enum Selection {
    Field(Field),
    InlineFragment(InlineFragment),
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Field {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alias: Option<String>,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selections: Option<SelectionSet>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InlineFragment {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub type_condition: Option<String>,
    pub selections: SelectionSet,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ResponsePathElement {
    // TODO(ran)(p1) FIXME: Looks like we don't actually ever use the Idx case. Simplify.
    Field(String),
    Idx(u32),
}

impl fmt::Display for ResponsePathElement {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ResponsePathElement::Field(str) => str.fmt(f),
            ResponsePathElement::Idx(i) => i.fmt(f),
        }
    }
}

pub type SelectionSet = Vec<Selection>;
pub type GraphQLDocument = String;

/// Hacking Json Serde to match JS.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase", tag = "kind")]
enum QueryPlanSerde {
    QueryPlan { node: Option<PlanNode> },
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::consts::TYPENAME_FIELD_NAME;
    use serde_json::Value;

    fn qp_json_string() -> &'static str {
        r#"
         {
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
                        "path": ["topProducts", "@"],
                        "node": {
                          "kind": "Fetch",
                          "serviceName": "books",
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
                          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{__typename isbn title year}}}"
                        }
                      },
                      {
                        "kind": "Flatten",
                        "path": ["topProducts", "@"],
                        "node": {
                          "kind": "Fetch",
                          "serviceName": "product",
                          "requires": [
                            {
                              "kind": "InlineFragment",
                              "typeCondition": "Book",
                              "selections": [
                                { "kind": "Field", "name": "__typename" },
                                { "kind": "Field", "name": "isbn" },
                                { "kind": "Field", "name": "title" },
                                { "kind": "Field", "name": "year" }
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
                        "path": ["product"],
                        "node": {
                          "kind": "Fetch",
                          "serviceName": "books",
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
                          "operation": "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{__typename isbn title year}}}"
                        }
                      },
                      {
                        "kind": "Flatten",
                        "path": ["product"],
                        "node": {
                          "kind": "Fetch",
                          "serviceName": "product",
                          "requires": [
                            {
                              "kind": "InlineFragment",
                              "typeCondition": "Book",
                              "selections": [
                                { "kind": "Field", "name": "__typename" },
                                { "kind": "Field", "name": "isbn" },
                                { "kind": "Field", "name": "title" },
                                { "kind": "Field", "name": "year" }
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
        }"#
    }

    fn query_plan() -> QueryPlan {
        QueryPlan {
            node: Some(PlanNode::Sequence {
                nodes: vec![
                    PlanNode::Fetch(FetchNode {
                        service_name: "product".to_owned(),
                        variable_usages: vec![],
                        requires: None,
                        operation: "{topProducts{__typename ...on Book{__typename isbn}...on Furniture{name}}product(upc:\"1\"){__typename ...on Book{__typename isbn}...on Furniture{name}}}".to_owned(),
                    }),
                    PlanNode::Parallel {
                        nodes: vec![
                            PlanNode::Sequence {
                                nodes: vec![
                                    PlanNode::Flatten(FlattenNode {
                                        path: vec![
                                            ResponsePathElement::Field("topProducts".to_owned()), ResponsePathElement::Field("@".to_owned())],
                                        node: Box::new(PlanNode::Fetch(FetchNode {
                                            service_name: "books".to_owned(),
                                            variable_usages: vec![],
                                            requires: Some(vec![
                                                Selection::InlineFragment(InlineFragment {
                                                    type_condition: Some("Book".to_owned()),
                                                    selections: vec![
                                                        Selection::Field(Field {
                                                            alias: None,
                                                            name: TYPENAME_FIELD_NAME.to_owned(),
                                                            selections: None,
                                                        }),
                                                        Selection::Field(Field {
                                                            alias: None,
                                                            name: "isbn".to_owned(),
                                                            selections: None,
                                                        })],
                                                })]),
                                            operation: "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{__typename isbn title year}}}".to_owned(),
                                        })),
                                    }),
                                    PlanNode::Flatten(FlattenNode {
                                        path: vec![
                                            ResponsePathElement::Field("topProducts".to_owned()),
                                            ResponsePathElement::Field("@".to_owned())],
                                        node: Box::new(PlanNode::Fetch(FetchNode {
                                            service_name: "product".to_owned(),
                                            variable_usages: vec![],
                                            requires: Some(vec![
                                                Selection::InlineFragment(InlineFragment {
                                                    type_condition: Some("Book".to_owned()),
                                                    selections: vec![
                                                        Selection::Field(Field {
                                                            alias: None,
                                                            name: TYPENAME_FIELD_NAME.to_owned(),
                                                            selections: None,
                                                        }),
                                                        Selection::Field(Field {
                                                            alias: None,
                                                            name: "isbn".to_owned(),
                                                            selections: None,
                                                        }),
                                                        Selection::Field(Field {
                                                            alias: None,
                                                            name: "title".to_owned(),
                                                            selections: None,
                                                        }),
                                                        Selection::Field(Field {
                                                            alias: None,
                                                            name: "year".to_owned(),
                                                            selections: None,
                                                        })],
                                                })]),
                                            operation: "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{name}}}".to_owned(),
                                        })),
                                    })]
                            },
                            PlanNode::Sequence {
                                nodes: vec![
                                    PlanNode::Flatten(FlattenNode {
                                        path: vec![
                                            ResponsePathElement::Field("product".to_owned())],
                                        node: Box::new(PlanNode::Fetch(FetchNode {
                                            service_name: "books".to_owned(),
                                            variable_usages: vec![],
                                            requires: Some(vec![
                                                Selection::InlineFragment(InlineFragment {
                                                    type_condition: Some("Book".to_owned()),
                                                    selections: vec![
                                                        Selection::Field(Field {
                                                            alias: None,
                                                            name: TYPENAME_FIELD_NAME.to_owned(),
                                                            selections: None,
                                                        }),
                                                        Selection::Field(Field {
                                                            alias: None,
                                                            name: "isbn".to_owned(),
                                                            selections: None,
                                                        })],
                                                })]),
                                            operation: "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{__typename isbn title year}}}".to_owned(),
                                        })),
                                    }),
                                    PlanNode::Flatten(FlattenNode {
                                        path: vec![
                                            ResponsePathElement::Field("product".to_owned())],
                                        node: Box::new(PlanNode::Fetch(FetchNode {
                                            service_name: "product".to_owned(),
                                            variable_usages: vec![],
                                            requires: Some(vec![
                                                Selection::InlineFragment(InlineFragment {
                                                    type_condition: Some("Book".to_owned()),
                                                    selections: vec![
                                                        Selection::Field(Field {
                                                            alias: None,
                                                            name: TYPENAME_FIELD_NAME.to_owned(),
                                                            selections: None,
                                                        }),
                                                        Selection::Field(Field {
                                                            alias: None,
                                                            name: "isbn".to_owned(),
                                                            selections: None,
                                                        }),
                                                        Selection::Field(Field {
                                                            alias: None,
                                                            name: "title".to_owned(),
                                                            selections: None,
                                                        }),
                                                        Selection::Field(Field {
                                                            alias: None,
                                                            name: "year".to_owned(),
                                                            selections: None,
                                                        })],
                                                })]),
                                            operation: "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{name}}}".to_owned(),
                                        })),
                                    })]
                            }]
                    }]
            })
        }
    }

    #[test]
    fn query_plan_from_json() {
        assert_eq!(
            serde_json::from_str::<QueryPlan>(qp_json_string()).unwrap(),
            query_plan()
        );
    }

    #[test]
    fn query_plan_into_json() {
        assert_eq!(
            serde_json::to_value(query_plan()).unwrap(),
            serde_json::from_str::<Value>(qp_json_string()).unwrap()
        );
    }
}
