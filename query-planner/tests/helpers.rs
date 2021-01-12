use apollo_query_planner::{QueryPlanner, QueryPlan, QueryPlanningOptions};

pub fn assert_query_plan(
  schema: &str,
  query: &str,
  expected_json: &str,
  options: QueryPlanningOptions
) {
  let planner = QueryPlanner::new(&schema);
  let expected: QueryPlan = serde_json::from_str(&expected_json).unwrap();
  let result = planner.plan(&query, options).unwrap();
  assert_eq!(result, expected);
}