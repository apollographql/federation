use apollo_query_planner::model::{FetchNode, PlanNode, QueryPlan, ResponsePathElement};
use graphql_parser::parse_query;
use graphql_parser::query::{Definition, FragmentDefinition, SelectionSet};
use indexmap::set::IndexSet;

#[test]
fn test_simple_query_plan() {
    fn fetch() -> PlanNode<'static> {
        fetch_node(
            "accounts",
            ss_from_op("query { me { name } }"),
            None,
            IndexSet::new(),
        )
    }

    let qp = QueryPlan(Some(PlanNode::Sequence(vec![fetch(), fetch()])));

    assert_eq!(
        format!("{}", qp),
        "\
QueryPlan {
  Sequence {
    Fetch(service: \"accounts\") {
      {
        me {
          name
        }
      }
    },
    Fetch(service: \"accounts\") {
      {
        me {
          name
        }
      }
    },
  },
}\
"
    );
}

#[test]
fn complex_query_plan() {
    fn field(f: &str) -> ResponsePathElement {
        ResponsePathElement::Field(f.to_string())
    }

    fn fetch_reviews() -> PlanNode<'static> {
        let mut tmp = parse_query(
            "query {
               topReviews {
                 ...__QueryPlanFragment_1__
               }
             }
             fragment __QueryPlanFragment_1__ on Review {
               body
               author
               product {
                 ...__QueryPlanFragment_0__
               }
             }
             fragment __QueryPlanFragment_0__ on Product {
               __typename
               ... on Book {
                 __typename
                 isbn
               }
               ... on Furniture {
                 __typename
                 upc
               }
             }",
        )
        .unwrap()
        .definitions;

        let ss = match tmp.remove(0) {
            Definition::Operation(op) => op.selection_set,
            _ => panic!("unexpected"),
        };
        let f1 = match tmp.remove(0) {
            Definition::Fragment(frag) => frag,
            _ => panic!("unexpected"),
        };
        let f2 = match tmp.remove(0) {
            Definition::Fragment(frag) => frag,
            _ => panic!("unexpected"),
        };
        let mut frag_set = IndexSet::new();
        frag_set.insert(f1);
        frag_set.insert(f2);

        fetch_node("reviews", ss, None, frag_set)
    }

    fn fetch_books() -> PlanNode<'static> {
        let ss = ss_from_op(
            "query {
              ... on Book {
                __typename
                isbn
                title
                year
              }
            }",
        );

        let requires = Some(ss_from_op(
            "query {
              ... on Book {
                __typename
                isbn
              }
            }",
        ));

        fetch_node("books", ss, requires, IndexSet::new())
    }

    fn fetch_product1() -> PlanNode<'static> {
        let requires = Some(ss_from_op(
            "query { ... on Book { __typename isbn title year }}",
        ));

        fetch_node(
            "product",
            ss_from_op("{... on Book { name } }"),
            requires,
            IndexSet::new(),
        )
    }

    fn fetch_product2() -> PlanNode<'static> {
        let ss = ss_from_op(
            "query {
              ... on Furniture {
                name
                price
                details {
                  country
                }
              }
              ... on Book {
                price
                details {
                  country
                }
              }
            }",
        );
        let requires = Some(ss_from_op(
            "query {
              ... on Furniture {
                __typename
                upc
              }
              ... on Book {
                __typename
                isbn
              }
            }",
        ));

        fetch_node("product", ss, requires, IndexSet::new())
    }

    let qp: QueryPlan = QueryPlan(Some(PlanNode::Sequence(vec![
        fetch_reviews(),
        PlanNode::Parallel(vec![
            PlanNode::Sequence(vec![
                PlanNode::Flatten {
                    path: vec![field("topReviews"), field("@"), field("product")],
                    node: Box::new(fetch_books()),
                },
                PlanNode::Flatten {
                    path: vec![field("topReviews"), field("@"), field("product")],
                    node: Box::new(fetch_product1()),
                },
            ]),
            PlanNode::Flatten {
                path: vec![field("topReviews"), field("@"), field("product")],
                node: Box::new(fetch_product2()),
            },
        ]),
    ])));

    assert_eq!(
        format!("{}", qp),
        "\
QueryPlan {
  Sequence {
    Fetch(service: \"reviews\") {
      {
        topReviews {
          ...__QueryPlanFragment_1__
        }
      }
      fragment __QueryPlanFragment_1__ on Review {
        body
        author
        product {
          ...__QueryPlanFragment_0__
        }
      }
      fragment __QueryPlanFragment_0__ on Product {
        __typename
        ... on Book {
          __typename
          isbn
        }
        ... on Furniture {
          __typename
          upc
        }
      }
    },
    Parallel {
      Sequence {
        Flatten(path: \"topReviews.@.product\") {
          Fetch(service: \"books\") {
            {
              ... on Book {
                __typename
                isbn
              }
            } =>
            {
              ... on Book {
                __typename
                isbn
                title
                year
              }
            }
          },
        },
        Flatten(path: \"topReviews.@.product\") {
          Fetch(service: \"product\") {
            {
              ... on Book {
                __typename
                isbn
                title
                year
              }
            } =>
            {
              ... on Book {
                name
              }
            }
          },
        },
      },
      Flatten(path: \"topReviews.@.product\") {
        Fetch(service: \"product\") {
          {
            ... on Furniture {
              __typename
              upc
            }
            ... on Book {
              __typename
              isbn
            }
          } =>
          {
            ... on Furniture {
              name
              price
              details {
                country
              }
            }
            ... on Book {
              price
              details {
                country
              }
            }
          }
        },
      },
    },
  },
}\
"
    );
}

fn ss_from_op(q: &str) -> SelectionSet {
    match parse_query(q).unwrap().definitions.remove(0) {
        Definition::Operation(op) => op.selection_set,
        Definition::SelectionSet(ss) => ss,
        thing => panic!("unexpected type/value: {}", thing),
    }
}

fn fetch_node<'a>(
    service_name: &str,
    selection_set: SelectionSet<'a>,
    requires: Option<SelectionSet<'a>>,
    internal_fragments: IndexSet<FragmentDefinition<'a>>,
) -> PlanNode<'a> {
    PlanNode::Fetch(Box::new(FetchNode {
        service_name: service_name.to_string(),
        selection_set,
        variable_usages: vec![],
        requires,
        internal_fragments,
        source: "???".to_string(),
    }))
}
