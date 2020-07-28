use crate::model::{FetchNode, PlanNode, QueryPlan};
use graphql_parser::query::{Field, Selection, SelectionSet};
use graphql_parser::{query, DisplayMinified, Pos};
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

        let fetch_nodes: Vec<PlanNode> = grouped
            .into_iter()
            .map(|(service, nodes)| to_fetch_node(service, nodes))
            .map(|n| PlanNode::Fetch(n))
            .collect();

        let pn = if parallel_root_fields {
            PlanNode::Parallel { nodes: fetch_nodes }
        } else {
            PlanNode::Sequence { nodes: fetch_nodes }
        };

        QueryPlan { node: Some(pn) }
    }
}

#[derive(Debug)]
struct TreeNode<'a> {
    name: &'a str,
    sub_nodes: Vec<TreeNode<'a>>,
}

impl<'a> TreeNode<'a> {
    pub fn add(&mut self, path: &'a [String]) {
        if !path.is_empty() {
            match self.sub_nodes.iter_mut().find(|f| f.name == path[0]) {
                Some(tree_node) => tree_node.add(&path[1..]),
                None => {
                    let mut tree_node = TreeNode {
                        name: path[0].as_str(),
                        sub_nodes: vec![],
                    };

                    tree_node.add(&path[1..]);

                    self.sub_nodes.push(tree_node);
                }
            }
        }
    }
}

fn to_fetch_node(service: String, nodes: Vec<&DagNode>) -> FetchNode {
    fn to_tree_nodes<'a>(nodes: Vec<&'a DagNode>) -> Vec<TreeNode<'a>> {
        let mut tree_nodes = LinkedHashMap::<String, TreeNode>::new();
        for node in nodes {
            tree_nodes
                .entry(node.path[0].clone())
                .or_insert(TreeNode {
                    name: node.path[0].as_str(),
                    sub_nodes: vec![],
                })
                .add(&node.path[1..])
        }

        tree_nodes
            .into_iter()
            .map(|(k, v)| v)
            .collect::<Vec<TreeNode>>()
    }

    fn to_selection(tn: TreeNode) -> Selection {
        Selection::Field(Field {
            position: pos(),
            alias: None,
            name: tn.name,
            arguments: vec![],
            directives: vec![],
            selection_set: to_selection_set(tn.sub_nodes),
        })
    }

    fn to_selection_set(tree_nodes: Vec<TreeNode>) -> query::SelectionSet {
        SelectionSet {
            span: span(),
            items: tree_nodes.into_iter().map(|tn| to_selection(tn)).collect(),
        }
    }

    let operation = to_selection_set(to_tree_nodes(nodes)).minified();

    FetchNode {
        service_name: service,
        variable_usages: vec![],
        requires: None,
        operation,
    }
}

fn pos() -> Pos {
    Pos { line: 1, column: 1 }
}

fn span() -> (Pos, Pos) {
    (pos(), pos())
}

#[cfg(test)]
mod tests {
    use crate::dag::{to_fetch_node, DagNode};
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
}
