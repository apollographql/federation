extern crate wasm_bindgen;

use apollo_query_planner::{QueryPlanner, QueryPlanningOptions};
use js_sys::JsString;
use owning_ref::OwningRef;
use std::cell::RefCell;
use std::marker::PhantomPinned;
use std::pin::Pin;
use std::ptr::NonNull;
use std::rc::Rc;
use wasm_bindgen::prelude::*;

/// These vectors serve as repositories for the Schema string and QueryPlanner
/// so that they don't get garbage collected. The JavaScript side gets the index
/// into the vector, which it can use in `getQueryPlan`.
static mut SCHEMA: Vec<Option<String>> = vec![];
static mut DATA: Vec<Option<QueryPlanner>> = vec![];

struct Planner<'s> {
    schema: String,
    // schema: Pin<Box<String>>,
    data: QueryPlanner<'s>,
    _pin: PhantomPinned,
}

// struct Planners<'s> {
//     planners: Vec<Option<Rc<Planner<'s>>>>,
// }

// impl<'s> Planner<'s> {
// fn from(schema: String) -> Pin<Box<Planner<'static>>> {
// fn from(schema: Box<String>) -> OwningRef<Box<String>, QueryPlanner<'static>> {
//     // Attempe 3
//     // let mut pin = Box::pin(Planner {
//     //     schema,
//     //     data: QueryPlanner::empty(),
//     //     _pin: PhantomPinned,
//     // });

//     // let slice = NonNull::from(&pin.schema);
//     // // we know this is safe because modifying a field doesn't move the whole struct
//     // unsafe {
//     //     let mut_ref: Pin<_> = Pin::as_mut(&mut pin);
//     //     Pin::get_unchecked_mut(mut_ref).data = QueryPlanner::new(&pin.schema);
//     // }

//     // return pin

//     // Attempt 2
// let p = NonNull::from(&pin);
// unsafe {
//     // let q =
//     let mut planner = Planner {
//         schema: p,
//         data: QueryPlanner::empty(),
//     };
//     planner.data = QueryPlanner::new(planner.schema.as_ref());
//     return planner;
// }

mod two {
    use super::*;

    struct Planner<'s> {
        schema: String,
        data: QueryPlanner<'s>,
    }

    static mut PLANNERS: Vec<Planner> = vec![];

    fn make(schema: String) {
        unsafe {
            let id = PLANNERS.len();
            PLANNERS.push(Planner {
                schema,
                data: QueryPlanner::empty(),
            });
            PLANNERS[id].data = QueryPlanner::new(&PLANNERS[id].schema)
        }
    }
}

/* --------------------- one -------------------- */
// mod one {
//     use super::*;
//     static mut PLANNERS: Vec<OwningRef<Box<String>, QueryPlanner>> = vec![];
//     fn from(schema: String) {
//         let schema = OwningRef::new(Box::new(schema));
//         let m = schema.map(|owner: &String| &QueryPlanner::new(owner));
//         // unsafe {
//         //     PLANNERS.push(m);
//         // }
//     }
// }
/* ------------------------ /one ------------------- */

// impl<'s> Planners<'s> {
//     fn get_query_planner(&mut self, schema: String) -> usize {
//         for i in 0..self.planners.len() {
//             match &self.planners[i] {
//                 Some(x) if *x.schema.borrow() == schema => {
//                     let id = self.planners.len();
//                     self.planners.push(self.planners[i].clone());
//                     return id;
//                 }
//                 _ => (),
//             }
//         }
//         let id = self.planners.len();
//         self.planners.push(Some(Rc::new(Planner::from(schema))));
//         // self.schemas.push(Some(schema));
//         // // oops, lifetime's broked.
//         // self.datas
//         //     .push(Some(QueryPlanner::new(&self.schemas[id].as_ref().unwrap())));
//         return id;
//     }
// }

/// getQueryPlanner creates a QueryPlanner if needed, and returns an "id"
/// for later use with `getQueryPlan`. Calling this multiple times with
/// the same schema will only result in the schema being parsed once, and the
/// QueryPlanner is cloned.
#[wasm_bindgen(js_name = getQueryPlanner)]
pub fn get_query_planner(schema: JsString) -> usize {
    let schema = String::from(schema);
    unsafe {
        for i in 0..SCHEMA.len() {
            match &SCHEMA[i] {
                Some(x) if x == &schema => {
                    let id = SCHEMA.len();
                    SCHEMA.push(Some(schema));
                    // No need to re-parse, we can just clone!
                    DATA.push(DATA[i].clone());
                    return id;
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
/// This can happen when an ApolloGateway updates & replaces its QueryPlanner,
/// or when an ApolloGateway is no longer needed.
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
