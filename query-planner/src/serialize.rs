use itertools::Itertools;

use crate::model::{PlanNode, QueryPlan};

pub fn serialize(qp: &QueryPlan) -> String {
    serialize_with_config(qp, &DEFAULT_SER_CONFIG)
}

fn serialize_with_config(qp: &QueryPlan, config: &PrinterConfig) -> String {
    let mut result: Vec<String> = Vec::new();
    result.push("QueryPlan {".to_string());
    for n in qp.node.iter() {
        append_nodes(vec![&n], config, "", &mut result)
    }
    result.push("}".to_string());
    result.join("")
}

fn append_nodes(
    nodes: Vec<&PlanNode>,
    config: &PrinterConfig,
    indentation: &str,
    result: &mut Vec<String>,
) {
    if nodes.is_empty() {
        return;
    }

    result.push(config.spacing_outer.to_string());

    let indentation_next = indentation.to_owned() + config.indent;

    for (i, node) in nodes.iter().enumerate() {
        result.push(indentation_next.clone());
        append_node(node, config, indentation_next.as_str(), result);

        if i < nodes.len() - 1 {
            result.push(",".to_string());
            result.push(config.spacing_inner.to_string());
        } else if !config.min {
            result.push(",".to_string());
        }
    }

    result.push(config.spacing_outer.to_string());
    result.push(indentation.to_string());
}

fn append_node(
    node: &PlanNode,
    config: &PrinterConfig,
    indentation: &str,
    result: &mut Vec<String>,
) {
    let nodes: Vec<&PlanNode> = match node {
        PlanNode::Fetch(fetch_node) => {
            let indentation_next = indentation.to_owned() + config.indent;
            result.push(format!(
                "Fetch(service: \"{}\") {{",
                fetch_node.service_name
            ));
            {
                result.push(config.spacing_outer.to_string());
                result.push(indentation_next.clone());

                if let Some(requires) = &fetch_node.requires {
                    result.push(format!("{}", requires));
                    result.push(" =>".to_string());
                    result.push(config.spacing_outer.to_string());
                    result.push(indentation_next.clone());
                }
                result.push(format!("{}", fetch_node.selection_set));
                result.push(config.spacing_outer.to_string());
                result.push(indentation_next.clone());

                if !fetch_node.internal_fragments.is_empty() {
                    result.push("  ".to_string());
                    fetch_node
                        .internal_fragments
                        .iter()
                        .map(|fr| format!("{}", fr))
                        .join(("\n".to_string() + indentation_next.as_str()).as_str());
                }
            }
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
        PlanNode::Parallel { nodes } => {
            result.push("Parallel".to_string());
            nodes.iter().collect::<Vec<&PlanNode>>()
        }
        PlanNode::Sequence { nodes } => {
            result.push("Sequence".to_string());
            nodes.iter().collect::<Vec<&PlanNode>>()
        }
    };

    if !nodes.is_empty() {
        result.push(" {".to_string());
        append_nodes(nodes, config, indentation, result);
        result.push("}".to_string());
    };
}

lazy_static! {
    static ref DEFAULT_SER_CONFIG: PrinterConfig = PrinterConfig {
        spacing_outer: " ",
        spacing_inner: " ",
        min: true,
        indent: "    ",
    };
}

pub struct PrinterConfig {
    spacing_outer: &'static str,
    spacing_inner: &'static str,
    min: bool,
    indent: &'static str,
}
