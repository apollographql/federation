use cucumber::cucumber;

use apollo_query_planner::model::QueryPlan;
use apollo_query_planner::QueryPlanner;

// // only used by tests for now
fn build_query_plan_from_str(schema: &str, query: &str) -> QueryPlan {
    let planner = QueryPlanner::new(schema);
    planner.plan(query).expect("failed building QueryPlan")
}

pub struct QueryPlannerTestContext {
    // You can use this struct for mutable context in scenarios.
    query: Option<String>,
}

impl cucumber::World for QueryPlannerTestContext {}

impl std::default::Default for QueryPlannerTestContext {
    fn default() -> QueryPlannerTestContext {
        // This function is called every time a new scenario is started
        QueryPlannerTestContext { query: None }
    }
}

mod query_planner_tests {
    use cucumber::steps;

    use crate::{build_query_plan_from_str, QueryPlan};

    // Any type that implements cucumber::World + Default can be the world
    steps!(crate::QueryPlannerTestContext => {
        given "query" |context, step| {
            match &step.docstring {
                Some(query_string) => {
                    // store the query on context so other steps can acces it
                    context.query = Some(query_string.clone());
                },
                None => panic!("no argument to query step")
            }
        };

        when "using autofragmentization" |_context, _step | {
            unimplemented!()
        };

        then "query plan" |context, step| {
            match &context.query {
                Some(query) => {
                    // todo use a schema here rather than this stub
                    let built_plan = build_query_plan_from_str("type Query { hello: String }", query.as_ref());

                    match &step.docstring {
                        Some(expected_plan_string) => {
                            assert_eq!(built_plan, serde_json::from_str::<QueryPlan>(expected_plan_string).unwrap());
                        },
                        None => panic!("no argument to query plan step")
                    }
                },
                None => std::unreachable!()
            }
        };
    });
}

// To ignore: comment out the [[test]] block in cargo.toml
cucumber! {
    features: "./", // Path to our feature files
    world: crate::MyWorld, // The world needs to be the same for steps and the main cucumber call
    steps: &[
        query_planner_tests::steps // the `steps!` macro creates a `steps` function in a module
        ]
}
