extern crate wasm_bindgen;

use apollo_query_planner::QueryPlanner;
use js_sys::JsString;
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
pub fn get_query_plan(planner_ptr: usize, query: &str) -> JsValue {
    unsafe {
        let planner = planner_ptr as *const QueryPlanner;
        let planner: &QueryPlanner = &*planner;
        planner.plan(query).unwrap();
        JsValue::from_serde(&planner.plan(query).unwrap()).unwrap()
    }
}

// #[cfg(test)]
// mod tests {
//     use crate::{get_query_plan, get_query_planner};
//     use js_sys::JsString;
//     use wasm_bindgen::JsValue;
//     use wasm_bindgen_test::*;
//
//     #[wasm_bindgen_test]
//     fn getting_a_query_planner_and_using_it_multiple_times() {
//         let schema = include_str!("../../query-planner/tests/features/basic/csdl.graphql");
//         let planner = get_query_planner(JsString::from(schema));
//         let query = "query { me { name } }";
//         let plan = get_query_plan(planner, query);
//         let expected = JsValue::from_str(
//             r#"
//             {
//                 "kind": "QueryPlan",
//                 "node": {
//                     "kind": "Fetch",
//                     "serviceName": "accounts",
//                     "variableUsages": [],
//                     "operation": "{me{name}}"
//                   }
//             }
//         "#,
//         );
//         assert_eq!(plan, expected);
//     }
// }
