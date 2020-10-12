extern crate wasm_bindgen;

use apollo_query_planner::{QueryPlanner, QueryPlanningOptions};
use js_sys::JsString;
use wasm_bindgen::prelude::*;

/// These vectors serve as repositories for the Schema string and QueryPlanner
/// so that they don't get garbage collected. The JavaScript side gets the index
/// into the vector, which it can use in `getQueryPlan`.
static mut SCHEMA: Vec<Option<String>> = vec![];
static mut DATA: Vec<Option<QueryPlanner>> = vec![];

/// getQueryPlanner creates a QueryPlanner if needed, and returns an "id"
/// for later use with `getQueryPlan`. Calling this multiple times with
/// the same schema will only result in the schema being parsed once, and the
/// QueryPlanner is reused.
#[wasm_bindgen(js_name = getQueryPlanner)]
pub fn get_query_planner(schema: JsString) -> usize {
    let schema = String::from(schema);
    unsafe {
        for i in 0..SCHEMA.len() {
            match &SCHEMA[i] {
                Some(x) if x == &schema => {
                    return i;
                }
                _ => (),
            }
        }
        let id = SCHEMA.len();
        SCHEMA.push(Some(schema));
        DATA.push(Some(QueryPlanner::new(&SCHEMA[id].as_ref().unwrap())));
        return id;
    }
}

/// Drop a query planner (and associated Schema string) to free up memory.
/// Most applications will have a single query planner that they use
/// for the duration of the app's lifetime, but if you are working
/// with multiple QueryPlanners, you'll want to call this when you
/// are done with one.
#[wasm_bindgen(js_name = dropQueryPlanner)]
pub fn drop_query_planner(planner_idx: usize) {
    unsafe {
        if planner_idx < DATA.len() {
            // Setting the index to None will allow what was there to
            // be freed. We keep them there so that all indices will be
            // preserved.
            SCHEMA[planner_idx] = None;
            DATA[planner_idx] = None;
        }
    }
}

#[wasm_bindgen(js_name = getQueryPlan)]
pub fn get_query_plan(planner_idx: usize, query: &str, options: &JsValue) -> JsValue {
    let options: QueryPlanningOptions = options.into_serde().expect("Invalid format for options");
    unsafe {
        let planner = DATA[planner_idx]
            .as_ref()
            .expect("Query Planner has been dropped");
        let plan = planner.plan(query, options).expect("Failed to create plan");
        JsValue::from_serde(&plan).unwrap()
    }
}

#[cfg(test)]
mod tests {
    use crate::{get_query_plan, get_query_planner};
    use apollo_query_planner::model::{FetchNode, PlanNode, QueryPlan};
    use apollo_query_planner::QueryPlanningOptionsBuilder;
    use js_sys::JsString;
    use wasm_bindgen::JsValue;
    use wasm_bindgen_test::*;

    #[wasm_bindgen_test]
    fn getting_a_query_planner_and_using_it_multiple_times() {
        let schema =
            include_str!("../../stargate/crates/query-planner/tests/features/basic/csdl.graphql");
        let planner = get_query_planner(JsString::from(schema));
        let query = "query { me { name } }";

        let expected = QueryPlan {
            node: Some(PlanNode::Fetch(FetchNode {
                service_name: String::from("accounts"),
                requires: None,
                variable_usages: vec![],
                operation: String::from("{me{name}}"),
            })),
        };

        let options = QueryPlanningOptionsBuilder::default().build().unwrap();
        let options = JsValue::from_serde(&options).unwrap();
        let result = get_query_plan(planner, query, &options);
        let plan = result.into_serde::<QueryPlan>().unwrap();
        assert_eq!(plan, expected);
    }

    #[wasm_bindgen_test]
    fn multiple_query_planners() {
        let schema_multiple_keys = include_str!(
            "../../stargate/crates/query-planner/tests/features/multiple-keys/csdl.graphql"
        );
        let planner_multiple_keys = get_query_planner(JsString::from(schema_multiple_keys));
        let query_multiple_keys = "query { reviews { body } }";

        let schema_basic =
            include_str!("../../stargate/crates/query-planner/tests/features/basic/csdl.graphql");
        let planner_basic = get_query_planner(JsString::from(schema_basic));
        let query_basic = "query { me { name } }";

        let options = QueryPlanningOptionsBuilder::default().build().unwrap();
        let options = JsValue::from_serde(&options).unwrap();

        let result_basic = get_query_plan(planner_basic, query_basic, &options);
        let plan_basic = result_basic.into_serde::<QueryPlan>().unwrap();

        let result_multiple_keys =
            get_query_plan(planner_multiple_keys, query_multiple_keys, &options);
        let plan_multiple_keys = result_multiple_keys.into_serde::<QueryPlan>().unwrap();

        assert_ne!(plan_multiple_keys, plan_basic);
    }
}
