use graphql_parser::query::{FragmentDefinition, SelectionSet, VariableDefinition};
use itertools::Itertools;
use std::collections::{BTreeSet, HashMap};

enum ResponsePathElement {
    Field(String),
    Idx(u32),
}

impl ToString for ResponsePathElement {
    fn to_string(&self) -> String {
        match self {
            ResponsePathElement::Field(str) => str.to_string(),
            ResponsePathElement::Idx(i) => i.to_string(),
        }
    }
}

pub struct QueryPlan<'a> {
    node: Option<PlanNode<'a>>,
}

struct FetchNode<'a> {
    service_name: String,
    selection_set: SelectionSet<'a>,
    variable_usages: Option<HashMap<String, VariableDefinition<'a>>>,
    requires: Option<SelectionSet<'a>>,
    internal_fragments: BTreeSet<FragmentDefinition<'a>>,
    source: String,
}

enum PlanNode<'a> {
    Sequence {
        nodes: Vec<PlanNode<'a>>,
    },
    Parallel {
        nodes: Vec<PlanNode<'a>>,
    },
    Fetch(Box<FetchNode<'a>>),
    Flatten {
        path: Vec<ResponsePathElement>,
        node: Box<PlanNode<'a>>,
    },
}

impl<'a> QueryPlan<'a> {
    pub fn print(&self) -> String {
        self.serialize(&PrinterConfig {
            spacing_outer: " ",
            spacing_inner: " ",
            min: true,
            indent: "    ",
        })
    }

    // TODO(ran) FIXME: move around the same vector instead of strings.
    pub fn serialize(&self, config: &PrinterConfig) -> String {
        let nodes = self
            .node
            .as_ref()
            .map(|n| print_nodes(vec![&n], config, ""))
            .unwrap_or_else(|| String::from(""));

        format!("QueryPlan {{{}}}", nodes)
    }
}

fn print_nodes(nodes: Vec<&PlanNode>, config: &PrinterConfig, indentation: &str) -> String {
    if nodes.is_empty() {
        return String::from("");
    }

    let mut result = Vec::<String>::new();

    result.push(config.spacing_outer.to_string());

    let indentation_next = indentation.to_owned() + config.indent;

    for (i, node) in nodes.iter().enumerate() {
        result.push(indentation_next.clone());
        result.push(print_node(node, config, indentation_next.as_str()));

        if i < nodes.len() - 1 {
            result.push(",".to_string());
            result.push(config.spacing_inner.to_string());
        } else if !config.min {
            result.push(",".to_string());
        }
    }

    result.push(config.spacing_outer.to_string());
    result.push(indentation.to_string());

    result.join("")
}

fn print_node(node: &PlanNode, config: &PrinterConfig, indentation: &str) -> String {
    let mut result = Vec::<String>::new();

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
        result.push(print_nodes(nodes, config, indentation));
        result.push("}".to_string());
    }

    result.join("")
}

pub struct PrinterConfig {
    spacing_outer: &'static str,
    spacing_inner: &'static str,
    min: bool,
    indent: &'static str,
}
