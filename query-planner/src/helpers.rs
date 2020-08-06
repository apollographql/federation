use graphql_parser::query::refs::{FieldRef, InlineFragmentRef, SelectionRef, SelectionSetRef};
use graphql_parser::query::*;
use graphql_parser::schema::TypeDefinition;
use graphql_parser::{query, schema, Name, Pos};
use linked_hash_map::LinkedHashMap;
use std::collections::{HashMap, VecDeque};
use std::hash::Hash;
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
                        .or_insert_with(Vec::new)
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

pub(crate) fn pos() -> Pos {
    Pos { line: 0, column: 0 }
}

pub fn span() -> (Pos, Pos) {
    (pos(), pos())
}

pub fn merge_selection_sets<'q>(fields: Vec<&'q Field<'q>>) -> SelectionSetRef<'q> {
    fn merge_field_selection_sets<'q>(fields: Vec<&'q Selection<'q>>) -> Vec<SelectionRef<'q>> {
        let (field_nodes, fragment_nodes): (Vec<&Selection>, Vec<&Selection>) = fields
            .into_iter()
            .partition(|s| matches!(s, Selection::Field(_)));

        let (aliased_field_nodes, non_aliased_field_nodes): (Vec<&Selection>, Vec<&Selection>) =
            field_nodes.into_iter().partition(
                |s| letp!(Selection::Field(Field { alias, .. }) = *s => alias.is_some()),
            );

        let nodes_by_same_name = group_by(
            non_aliased_field_nodes,
            |s| letp!(Selection::Field(Field { name, .. }) = *s => *name),
        );

        let merged_field_nodes =
            nodes_by_same_name
                .into_iter()
                .map(|(_, v)| v)
                .map(|nodes_with_same_name| {
                    let node = nodes_with_same_name[0];
                    if node.selection_set().is_some() {
                        let items: Vec<SelectionRef<'q>> = merge_field_selection_sets(
                            nodes_with_same_name
                                .iter()
                                .flat_map(|s| s.selection_set())
                                .flat_map(|ss| ss.items.iter().collect::<Vec<&Selection>>())
                                .collect(),
                        );

                        let ssref = SelectionSetRef {
                            span: span(),
                            items,
                        };
                        match node {
                            Selection::FragmentSpread(_) => unreachable!(),
                            Selection::Field(f) => SelectionRef::FieldRef(FieldRef {
                                position: pos(),
                                alias: f.alias,
                                name: f.name,
                                arguments: f.arguments.clone(),
                                directives: f.directives.clone(),
                                selection_set: ssref,
                            }),
                            Selection::InlineFragment(inline) => {
                                SelectionRef::InlineFragmentRef(InlineFragmentRef {
                                    position: pos(),
                                    type_condition: inline.type_condition,
                                    directives: inline.directives.clone(),
                                    selection_set: ssref,
                                })
                            }
                        }
                    } else {
                        SelectionRef::Ref(node)
                    }
                });

        let aliased_field_nodes = aliased_field_nodes.into_iter().map(SelectionRef::Ref);
        let fragment_nodes = fragment_nodes.into_iter().map(SelectionRef::Ref);

        merged_field_nodes
            .chain(aliased_field_nodes)
            .chain(fragment_nodes)
            .collect()
    }

    let selections: Vec<&'q Selection<'q>> = fields
        .into_iter()
        .map(|f| &f.selection_set)
        .flat_map(|ss| ss.items.iter().collect::<Vec<&Selection>>())
        .collect();

    let items: Vec<SelectionRef<'q>> = merge_field_selection_sets(selections);

    SelectionSetRef {
        span: span(),
        items,
    }
}

pub fn group_by<T, K, F>(v: Vec<T>, f: F) -> LinkedHashMap<K, Vec<T>>
where
    F: Fn(&T) -> K,
    K: Hash + PartialEq + Eq,
{
    let mut map: LinkedHashMap<K, Vec<T>> = LinkedHashMap::new();
    for element in v.into_iter() {
        map.entry(f(&element)).or_insert(vec![]).push(element)
    }
    map
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
