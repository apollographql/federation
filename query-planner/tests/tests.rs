use apollo_query_planner::*;

mod features;
mod helpers;

#[test]
fn query_planning_options_initialization() {
    let options = QueryPlanningOptionsBuilder::default().build().unwrap();
    assert_eq!(false, options.auto_fragmentization);
}
