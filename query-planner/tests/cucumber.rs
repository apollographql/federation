#[macro_use]
extern crate lazy_static;

use cucumber::cucumber;

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
    use apollo_query_planner::model::QueryPlan;
    use apollo_query_planner::QueryPlanner;
    use cucumber::{skip, steps};

    static SCHEMA: &str = include_str!("features/csdl.graphql");

    lazy_static! {
        static ref PLANNER: QueryPlanner<'static> = QueryPlanner::new(SCHEMA);
    }

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
            skip!();
        };

        then "query plan" |context, step| {
            match &context.query {
                Some(query) => {
                    let built_plan = PLANNER.plan(query.as_ref()).expect("failed building QueryPlan");

                    match &step.docstring {
                        Some(expected_plan_string) => {
                            assert_eq!(built_plan, serde_json::from_str::<QueryPlan>(expected_plan_string).unwrap());
                        },
                        None => panic!("no argument to query plan step")
                    }
                },
                None => unreachable!()
            }
        };
    });
}

// To ignore: comment out the [[test]] block in cargo.toml
cucumber! {
    // Path to our feature files
    features: "./tests/features",
    // The world needs to be the same for steps and the main cucumber call
    world: crate::MyWorld,
    // the `steps!` macro creates a `steps` function in a module
    steps: &[query_planner_tests::steps]
}
