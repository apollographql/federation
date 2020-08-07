use graphql_parser::query::refs::{FieldRef, SelectionRef, SelectionSetRef};
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
    // TODO(ran) FIXME: make sure we also have obj.name -> [obj] mapping
    //  and maybe also union.name -> [obj,..] mappings, that might be tricky since it also needs a recursion.
    let mut implementing_types: HashMap<&'s str, Vec<&'s schema::ObjectType<'s>>> = HashMap::new();
    // NB: This will loop infinitely if the schema has implementation loops (A: B, B: A)
    // we must validate that before query planning.
    for &td in types.values() {
        match td {
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
                            for &iface in &iface.implements_interfaces {
                                // add them to the queue.
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

pub fn merge_selection_sets<'q>(fields: Vec<FieldRef<'q>>) -> SelectionSetRef<'q> {
    macro_rules! field_ref_from_field_like {
        ($f:ident) => {
            FieldRef {
                position: pos(),
                alias: $f.alias,
                name: $f.name,
                arguments: $f.arguments.clone(),
                directives: $f.directives.clone(),
                selection_set: SelectionSetRef {
                    span: span(),
                    items: $f
                        .selection_set
                        .items
                        .iter()
                        .map(|s| SelectionRef::Ref(s))
                        .collect(),
                },
            }
        };
    }

    fn merge_field_selection_sets(fields: Vec<SelectionRef>) -> Vec<SelectionRef> {
        let (field_nodes, fragment_nodes): (Vec<SelectionRef>, Vec<SelectionRef>) =
            fields.into_iter().partition(|s| s.is_field());

        let (aliased_field_nodes, non_aliased_field_nodes): (Vec<SelectionRef>, Vec<SelectionRef>) =
            field_nodes.into_iter().partition(|s| s.is_aliased_field());

        let nodes_by_same_name = group_by(non_aliased_field_nodes, |s| match s {
            // TODO(ran) FIXME: macro this match -- repeated a lot.
            SelectionRef::Ref(Selection::Field(Field { name, .. })) => *name,
            SelectionRef::Field(Field { name, .. }) => *name,
            SelectionRef::FieldRef(FieldRef { name, .. }) => *name,
            _ => unreachable!(),
        });

        let merged_field_nodes =
            nodes_by_same_name
                .into_iter()
                .map(|(_, v)| v)
                .map(|nodes_with_same_name| {
                    let nothing_to_do = nodes_with_same_name.len() == 1
                        || nodes_with_same_name[0].no_or_empty_selection_set();

                    if !nothing_to_do {
                        let (head, tail) = nodes_with_same_name.head();

                        let mut field_ref = match head {
                            SelectionRef::FieldRef(f) => f,
                            SelectionRef::Field(f) => field_ref_from_field_like!(f),
                            SelectionRef::Ref(Selection::Field(f)) => field_ref_from_field_like!(f),
                            _ => unreachable!(),
                        };

                        let head_items =
                            std::mem::replace(&mut field_ref.selection_set.items, vec![]);

                        let items = merge_field_selection_sets(
                            head_items
                                .into_iter()
                                .chain(
                                    tail.into_iter()
                                        .flat_map(|s| s.into_fields_selection_set())
                                        .flat_map(|ss| ss.items),
                                )
                                .collect(),
                        );

                        field_ref.selection_set.items = items;

                        SelectionRef::FieldRef(field_ref)
                    } else {
                        nodes_with_same_name.head().0
                    }
                });

        merged_field_nodes
            .chain(aliased_field_nodes)
            .chain(fragment_nodes)
            .collect()
    }

    let selections = fields
        .into_iter()
        .map(|f| f.selection_set)
        .flat_map(|ss| ss.items)
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

// https://github.com/graphql/graphql-js/blob/7b3241329e1ff49fb647b043b80568f0cf9e1a7c/src/type/introspection.js#L500-L509
pub fn is_introspection_type(name: &str) -> bool {
    name == "__Schema"
        || name == "__Directive"
        || name == "__DirectiveLocation"
        || name == "__Type"
        || name == "__Field"
        || name == "__InputValue"
        || name == "__EnumValue"
        || name == "__TypeKind"
}

pub trait Head<T> {
    /// gets the head and tail of a vector
    fn head(self) -> (T, Vec<T>);
}

impl<T> Head<T> for Vec<T> {
    fn head(self) -> (T, Vec<T>) {
        if self.is_empty() {
            panic!("head must be called on a non empty Vec")
        } else {
            let mut iter = self.into_iter();
            (iter.next().unwrap(), iter.collect())
        }
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
