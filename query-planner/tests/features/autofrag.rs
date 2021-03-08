use crate::helpers::plan;
use apollo_query_planner::QueryPlanningOptions;
use insta::assert_snapshot;

#[allow(non_snake_case)]
#[test]
fn auto_fragmentization_using_interfaces() {
    assert_snapshot!(
        plan(
            include_str!("autofrag/schema.graphql"),
            r##"
{
  field {
    a { b { f1 f2 f4 } }
    b { f1 f2 f4 }
    iface {
        ...on IFaceImpl1 { x }
        ...on IFaceImpl2 { x }
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
    "kind": "Fetch",
    "serviceName": "users",
    "variableUsages": [],
    "operation": "{field{...__QueryPlanFragment_2__}}fragment __QueryPlanFragment_0__ on B{f1 f2 f4}fragment __QueryPlanFragment_1__ on IFace{__typename ...on IFaceImpl1{x}...on IFaceImpl2{x}}fragment __QueryPlanFragment_2__ on SomeField{a{b{...__QueryPlanFragment_0__}}b{...__QueryPlanFragment_0__}iface{...__QueryPlanFragment_1__}}"
  }
}"##
    );
}

#[allow(non_snake_case)]
#[test]
fn auto_fragmentization_identical_selection_sets_in_different_types() {
    assert_snapshot!(
        plan(
            include_str!("autofrag/schema.graphql"),
            r##"
{
  sender {
   name
   address
   location
  }
  receiver {
   name
   address
   location
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
    "serviceName": "users",
    "variableUsages": [],
    "operation": "{sender{...__QueryPlanFragment_0__}receiver{...__QueryPlanFragment_1__}}fragment __QueryPlanFragment_0__ on SendingUser{name address location}fragment __QueryPlanFragment_1__ on ReceivingUser{name address location}"
  }
}"##
    );
}
