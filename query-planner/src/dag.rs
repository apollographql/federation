use crate::model::QueryPlan;

pub struct QueryPlanGraph {}

#[derive(Hash)]
pub struct DagNode {
    pub service: String,
    pub path: Vec<String>,
}

impl QueryPlanGraph {
    pub fn new() -> QueryPlanGraph {
        QueryPlanGraph {}
    }

    pub fn add(&mut self, node: DagNode) {
        unimplemented!()
    }

    pub fn into_query_plan(self, parallel_root_fields: bool) -> QueryPlan {
        unimplemented!()
    }
}

#[cfg(test)]
mod tests {
    // TODO(ran) FIXME: remove if not really used a lot.
    macro_rules! pq {
        ($str:expr) => {
            graphql_parser::parse_query($str).expect("failed parsing query");
        };
    }

    #[test]
    fn temp() {
        println!("{:?}", pq!("{ me { name } }"));
    }
}
