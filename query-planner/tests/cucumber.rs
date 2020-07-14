use cucumber::cucumber;

pub struct QueryPlannerTestContext {
    // You can use this struct for mutable context in scenarios.
    schema: Option<String>,
    expected_plan: Option<String>,
}

impl cucumber::World for QueryPlannerTestContext {}
impl std::default::Default for QueryPlannerTestContext {
    fn default() -> QueryPlannerTestContext {
        // This function is called every time a new scenario is started
        QueryPlannerTestContext {
            schema: None,
            expected_plan: None,
        }
    }
}

mod query_planner_tests {
    use cucumber::steps;

    // Any type that implements cucumber::World + Default can be the world
    steps!(crate::QueryPlannerTestContext => {
        given "query" |context, step| {
            match &step.docstring {
                Some(schema_string) => {
                    // store the query on context so other steps can acces it
                    context.schema = Some(schema_string.clone());
                }, 
                None => panic!("ew no")
            }
            assert_eq!("hi", "hi");
        };

        then "query plan" |context, step| {
            match &step.docstring {
                Some(expected_plan_string) => {
                    context.expected_plan = Some(expected_plan_string.clone());
                }, 
                None => panic!("ew no")
            }
            assert_eq!("", "");
        };
    });
}

cucumber! {
    // path relative to cargo.lock
    features: "./", // Path to our feature files
    world: crate::MyWorld, // The world needs to be the same for steps and the main cucumber call
    steps: &[
        query_planner_tests::steps // the `steps!` macro creates a `steps` function in a module
    ]
    // setup: setup, // Optional; called once before everything
    // before: &[
    //     a_before_fn // Optional; called before each scenario
    // ],
    // after: &[
    //     an_after_fn // Optional; called after each scenario
    // ]
}
