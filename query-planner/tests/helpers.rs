use apollo_query_planner::{QueryPlanner, QueryPlanningOptions};

pub fn plan(schema: &str, query: &str, options: QueryPlanningOptions) -> String {
    let planner = QueryPlanner::new(&schema).unwrap();
    // let expected: QueryPlan = serde_json::from_str(&expected_json).unwrap();
    let result = planner.plan(&query, options).unwrap();
    // assert_eq!(
    //   format!("{:#?}", result),
    //   format!("{:#?}", expected));
    serde_json::to_string_pretty(&result).unwrap()
}
