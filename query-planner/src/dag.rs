use crate::model::{FetchNode, QueryPlan};
use graphql_parser::query::{Field, Selection, SelectionSet};
use graphql_parser::{query, Pos};
use linked_hash_map::LinkedHashMap;
use linked_hash_set::{Iter, LinkedHashSet};
use std::cmp::max;
use std::collections::HashMap;
use std::iter::Filter;

pub struct QueryPlanGraph<'q> {
    nodes: LinkedHashSet<DagNode<'q>>,
}

#[derive(Hash)]
pub struct DagNode<'q> {
    pub service: String,
    pub path: Vec<String>,
    pub dependencies: Vec<&'q DagNode<'q>>,
}

impl<'q> PartialEq for DagNode<'q> {
    fn eq(&self, other: &Self) -> bool {
        self.path == other.path && self.service == other.service
    }
}

impl<'q> Eq for DagNode<'q> {}

impl<'q> QueryPlanGraph<'q> {
    pub fn new() -> QueryPlanGraph<'q> {
        QueryPlanGraph {
            nodes: LinkedHashSet::new(),
        }
    }

    pub fn add(&mut self, node: DagNode<'q>) {
        self.nodes.insert_if_absent(node);
    }

    pub fn into_query_plan(self, parallel_root_fields: bool) -> QueryPlan {
        // let nodes: Vec<&DagNode> = self.nodes.iter().collect();
        let first_layer = self.nodes.iter().filter(|n| n.dependencies.is_empty());

        let mut grouped: HashMap<String, Vec<&DagNode>> = HashMap::new();
        for node in first_layer {
            grouped
                .entry(node.service.clone())
                .or_insert(vec![])
                .push(node)
        }

        let fetch_nodes: Vec<FetchNode> = grouped
            .into_iter()
            .map(|(service, nodes)| to_fetch_node(service, nodes))
            .collect();

        if parallel_root_fields {
        } else {
            unimplemented!()
        }

        unimplemented!()
    }
}

fn to_fetch_node(service: String, nodes: Vec<&DagNode>) -> FetchNode {
    #[derive(Debug)]
    struct TreeNode {
        name: String,
        foos: Vec<TreeNode>,
    }

    impl TreeNode {
        pub fn add(&mut self, path: &[String]) {
            if !path.is_empty() {
                match self.foos.iter_mut().find(|f| f.name == path[0]) {
                    Some(tree_node) => tree_node.add(&path[1..]),
                    None => {
                        let mut tree_node = TreeNode {
                            name: path[0].clone(),
                            foos: vec![],
                        };

                        tree_node.add(&path[1..]);

                        self.foos.push(tree_node);
                    }
                }
            }
        }
    }

    fn to_tree_nodes(nodes: Vec<&DagNode>) -> Vec<TreeNode> {
        let mut tree_nodes = LinkedHashMap::<String, TreeNode>::new();
        for node in nodes {
            tree_nodes
                .entry(node.path[0].clone())
                .or_insert(TreeNode {
                    name: node.path[0].clone(),
                    foos: vec![],
                })
                .add(&node.path[1..])
        }

        tree_nodes
            .into_iter()
            .map(|(k, v)| v)
            .collect::<Vec<TreeNode>>()
    }

    fn to_selection_set<'a>(tree_nodes: Vec<TreeNode>) -> query::SelectionSet<'a> {}

    let tree_nodes = to_tree_nodes(nodes);

    unimplemented!()
}

fn pos() -> Pos {
    Pos { line: 1, column: 1 }
}

fn span() -> (Pos, Pos) {
    (pos(), pos())
}

#[cfg(test)]
mod tests {
    use crate::dag::{to_tree_nodes, DagNode};
    // TODO(ran) FIXME: remove if not really used a lot.
    macro_rules! pq {
        ($str:expr) => {
            graphql_parser::parse_query($str).expect("failed parsing query");
        };
    }

    macro_rules! s {
        ($str:expr) => {
            String::from($str)
        };
    }

    #[test]
    fn temp() {
        let paths = vec![
            DagNode {
                path: vec![s!("a"), s!("b"), s!("c")],
                service: s!("X"),
                dependencies: vec![],
            },
            DagNode {
                path: vec![s!("a"), s!("b"), s!("d")],
                service: s!("X"),
                dependencies: vec![],
            },
            DagNode {
                path: vec![s!("a"), s!("c")],
                service: s!("X"),
                dependencies: vec![],
            },
            DagNode {
                path: vec![s!("d"), s!("x")],
                service: s!("X"),
                dependencies: vec![],
            },
        ];
        let tree_nodes = to_tree_nodes(s!("X"), paths.iter().collect());
        println!("{:?}", tree_nodes);
    }
}
