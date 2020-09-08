extern crate wasm_bindgen;

use apollo_query_planner::QueryPlanner;
use js_sys::JsString;
use std::panic;
use wasm_bindgen::prelude::*;

static mut SCHEMA: Vec<String> = vec![];
static mut DATA: Vec<QueryPlanner> = vec![];

#[wasm_bindgen(js_name = getQueryPlanner)]
pub fn get_query_planner(schema: JsString) -> usize {
    unsafe {
        if SCHEMA.is_empty() {
            SCHEMA.push(String::from(schema));
            DATA.push(QueryPlanner::new(&SCHEMA[0]));
        } else {
            SCHEMA[0] = String::from(schema);
            DATA[0] = QueryPlanner::new(&SCHEMA[0]);
        }
        let data = &DATA[0];
        data as *const QueryPlanner as usize
    }
}

#[wasm_bindgen(js_name = getQueryPlan)]
pub fn get_query_plan(planner_ptr: usize, query: &str) -> Vec<JsValue> {
    unsafe {
        let res = panic::catch_unwind(|| {
            let planner = planner_ptr as *const QueryPlanner;
            let planner: &QueryPlanner = &*planner;
            let plan = planner.plan(query).unwrap();
            JsValue::from_serde(&plan).unwrap()
        });
        dbg!(&res);

        match res {
            Ok(t) => vec![t, JsValue::UNDEFINED],
            Err(e) => match e.downcast::<String>() {
                Ok(s) => vec![JsValue::UNDEFINED, JsValue::from_str(&s)],
                Err(_) => vec![JsValue::UNDEFINED, JsValue::from_str("Unknown error")],
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::{get_query_plan, get_query_planner};
    use apollo_query_planner::model::{FetchNode, PlanNode, QueryPlan};
    use js_sys::JsString;
    use wasm_bindgen::JsValue;
    use wasm_bindgen_test::*;

    #[wasm_bindgen_test]
    fn getting_a_query_planner_and_using_it_multiple_times() {
        let schema = include_str!("../../query-planner/tests/features/basic/csdl.graphql");
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

        for _ in 0..5 {
            let mut results = get_query_plan(planner, query);
            assert_eq!(2, results.len());
            assert_eq!(JsValue::UNDEFINED, results.pop().unwrap());
            let actual_result = results.pop().unwrap();
            let plan = actual_result.into_serde::<QueryPlan>().unwrap();
            assert_eq!(plan, expected);
        }
    }

    #[wasm_bindgen_test]
    fn failing_to_plan_a_query_returns_an_error_string() {
        let schema = include_str!("../../query-planner/tests/features/basic/csdl.graphql");
        let planner = get_query_planner(JsString::from(schema));
        let query = "query { me { thereIsNoSpoonField } }";

        for _ in 0..5 {
            let mut results = get_query_plan(planner, query);
            dbg!(&results);
            assert_eq!(2, results.len());
            let error = results.pop().unwrap().as_string().unwrap();
            assert_eq!(
                "Cannot query field `thereIsNoSpoonField` on type `User`",
                error
            );
            assert_eq!(JsValue::UNDEFINED, results.pop().unwrap());
        }
    }
}
