use cucumber::cucumber;
use std::fmt;

type Result<T> = std::result::Result<T, QueryPlanError>;

// stub out a custom QueryPlanError
#[derive(Debug, Clone)]
struct QueryPlanError;
impl fmt::Display for QueryPlanError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "error in building query plan")
    }
}

struct Schema {}
fn parse_schema(_schema: &str) -> Result<Schema> {
    Ok(Schema {})
}

struct Query {}
fn parse_query(_query: &str) -> Result<Query> {
    Ok(Query {})
}
#[derive(Debug)]
struct QueryPlan {
    foo: String,
}
impl std::cmp::PartialEq for QueryPlan {
    fn eq(&self, other: &QueryPlan) -> bool {
        self.foo == other.foo
    }
}

fn build_query_plan(_schema: &Schema, _query: &Query) -> Result<QueryPlan> {
    Ok(QueryPlan {
        foo: "okay then".to_string(),
    })
}

// // only used by tests for now
fn build_query_plan_from_str(schema: &str, query: &str) -> QueryPlan {
    let schema = parse_schema(schema).expect("failed parsing schema");
    let query = parse_query(query).expect("failed parsing query");
    build_query_plan(&schema, &query).expect("failed building QueryPlan")
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
    use crate::{build_query_plan_from_str, QueryPlan};
    use cucumber::steps;

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

        then "query plan" |context, step| {
            match &context.query {
                Some(query) => {
                    // todo use a schema here rather than this stub
                    let built_plan = build_query_plan_from_str("type Query { hello: String }", query.as_ref());
                    
                    match &step.docstring {
                        // todo: deserialize from string to query plan
                        Some(_expected_plan_string) => {
                            assert_eq!(built_plan, QueryPlan { foo: "okay then".to_string() });
                        }, 
                        None => panic!("no argument to query plan step")
                    }
                },
                None => std::unreachable!()
            }
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
