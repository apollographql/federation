#[test]
fn it_fails() {
    assert_eq!(false, true);
}

use apollo_query_planner::*;

mod helpers;
mod features;

#[test]
fn query_planning_options_initialization() {
    let options = QueryPlanningOptionsBuilder::default().build().unwrap();
    assert_eq!(false, options.auto_fragmentization);
}
