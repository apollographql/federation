extern crate wasm_bindgen;

use apollo_query_planner::{QueryPlanner, QueryPlanningOptions};
use js_sys::JsString;
use wasm_bindgen::prelude::*;

static mut SCHEMA: Vec<String> = vec![];
static mut DATA: Vec<QueryPlanner> = vec![];

#[wasm_bindgen(js_name = getQueryPlanner)]
pub fn get_query_planner(schema: JsString) -> usize {
    unsafe {
        let idx = SCHEMA.len();
        SCHEMA.push(String::from(schema));
        DATA.push(QueryPlanner::new(&SCHEMA[idx]));
        idx
    }
}

#[wasm_bindgen(js_name = updatePlannerSchema)]
pub fn update_planner_schema(idx: usize, schema: JsString) {
    unsafe {
        if SCHEMA.get(idx).is_none() {
            panic!("Index {} not found", idx)
        }

        SCHEMA[idx] = String::from(schema);
        DATA[idx] = QueryPlanner::new(&SCHEMA[idx]);
    }
}

#[wasm_bindgen(js_name = getQueryPlan)]
pub fn get_query_plan(idx: usize, query: &str, options: &JsValue) -> JsValue {
    let options: QueryPlanningOptions = options.into_serde().unwrap();
    unsafe {
        let planner = &DATA[idx];
        let plan = planner.plan(query, options).unwrap();
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
