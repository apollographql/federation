use itertools::Itertools;

use crate::model::{PlanNode, QueryPlan};

static INDENT: &str = "  ";

pub fn display(qp: &QueryPlan) -> String {
    let mut result: Vec<String> = Vec::new();
    result.push("QueryPlan {\n".to_string());
    for n in qp.0.iter() {
        append_nodes(vec![&n], INDENT, &mut result)
    }
    result.push("}".to_string());
    result.join("")
}

fn append_nodes(nodes: Vec<&PlanNode>, indentation: &str, result: &mut Vec<String>) {
    if nodes.is_empty() {
        return;
    }

    for node in nodes.iter() {
        append_node(node, indentation, result);
        result.push(",\n".to_string());
    }
}

fn append_node(node: &PlanNode, indentation: &str, result: &mut Vec<String>) {
    let indent_all = |str: String| -> String {
        str.lines()
            .into_iter()
            .map(|l| indentation.to_string() + INDENT + l)
            .join("\n")
    };

    result.push(indentation.to_string());

    let idnt_next = indentation.to_string() + INDENT;

    let nodes: Vec<&PlanNode> = match node {
        PlanNode::Fetch(fetch) => {
            result.push(format!("Fetch(service: \"{}\") {{\n", fetch.service_name));
            {
                if let Some(requires) = &fetch.requires {
                    result.push(indent_all(format!("{}", requires)));
                    result.push(" =>\n".to_string());
                }

                result.push(indent_all(format!("{}", fetch.selection_set)));
                result.push("\n".to_string());

                if !fetch.internal_fragments.is_empty() {
                    for fr in fetch.internal_fragments.iter() {
                        result.push(indent_all(format!("{}", fr)));
                        result.push("\n".to_string());
                    }
                }
            }
            result.push(indentation.to_string());
            result.push("}".to_string());
            Vec::new()
        }
        PlanNode::Flatten { path, node } => {
            result.push(format!(
                "Flatten(path: \"{}\")",
                path.iter().map(|p| p.to_string()).join(".")
            ));
            vec![node.as_ref()]
        }
        PlanNode::Parallel(nodes) => {
            result.push("Parallel".to_string());
            nodes.iter().collect::<Vec<&PlanNode>>()
        }
        PlanNode::Sequence(nodes) => {
            result.push("Sequence".to_string());
            nodes.iter().collect::<Vec<&PlanNode>>()
        }
    };

    if !nodes.is_empty() {
        result.push(" {\n".to_string());
        append_nodes(nodes, idnt_next.as_str(), result);
        result.push(indentation.to_string());
        result.push("}".to_string());
    };
}
