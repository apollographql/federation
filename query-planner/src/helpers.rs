use graphql_parser::query::*;
use graphql_parser::schema::TypeDefinition;
use graphql_parser::{query, schema, Name};
use std::collections::{HashMap, VecDeque};
use std::iter::FromIterator;

pub fn get_operations<'q>(query: &'q Document<'q>) -> Vec<Op<'q>> {
    query
        .definitions
        .iter()
        .flat_map(|d| match d {
            Definition::Operation(op) => Some(Op {
                kind: op.kind,
                selection_set: &op.selection_set,
            }),
            Definition::SelectionSet(ss) => Some(Op {
                kind: query::Operation::Query,
                selection_set: ss,
            }),
            _ => None,
        })
        .collect()
}

pub fn ifaces_to_implementors<'a, 's: 'a>(
    types: &'a HashMap<&'s str, &'s schema::TypeDefinition<'s>>,
) -> HashMap<&'s str, Vec<&'s schema::ObjectType<'s>>> {
    let mut implementing_types: HashMap<&'s str, Vec<&'s schema::ObjectType<'s>>> = HashMap::new();
    // NB: This will loop infinitely if the schema has implementation loops (A: B, B: A)
    // we must validate that before query planning.
    for td in types.values() {
        match *td {
            TypeDefinition::Object(ref obj) if !obj.implements_interfaces.is_empty() => {
                let mut queue: VecDeque<&str> =
                    VecDeque::from_iter(obj.implements_interfaces.iter().cloned());

                while !queue.is_empty() {
                    // get iface from queue.
                    let iface = queue.pop_front().unwrap();

                    // associate iface with obj
                    implementing_types
                        .entry(iface)
                        .or_insert_with(|| vec![])
                        .push(obj);
                    println!("adding {:?} to {:?}", obj.name, iface);

                    letp!(
                        TypeDefinition::Interface(iface) = types[iface] =>
                            for iface in &iface.implements_interfaces {
                                // add them to the queue.
                                let iface = *iface;
                                queue.push_back(iface);
                            }
                    );
                }
            }
            _ => (),
        }
    }

    implementing_types
}

pub fn names_to_types<'s>(
    schema: &'s schema::Document<'s>,
) -> HashMap<&'s str, &'s TypeDefinition<'s>> {
    schema
        .definitions
        .iter()
        .flat_map(|d| match d {
            schema::Definition::Type(td) => Some(td),
            _ => None,
        })
        .map(|td| (td.name().unwrap(), td))
        .collect()
}

pub fn variable_name_to_def<'q>(
    query: &'q query::Document<'q>,
) -> HashMap<&'q str, &'q VariableDefinition<'q>> {
    match query
        .definitions
        .iter()
        .find(|d| matches!(d, Definition::Operation(_)))
    {
        Some(op) => {
            let defs = letp!(Definition::Operation(op) = op => &op.variable_definitions);
            defs.iter().map(|vd| (vd.name, vd)).collect()
        }
        None => HashMap::new(),
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Op<'q> {
    pub selection_set: &'q SelectionSet<'q>,
    pub kind: query::Operation,
}

pub enum NodeCollectionKind {
    Sequence,
    Parallel,
}
