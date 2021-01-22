use graphql_parser::query;
use graphql_parser::query::refs::SelectionSetRef;
use graphql_parser::schema::*;
use graphql_parser::{parse_query, Pos};
use using::{Implementations, Request, Schema, Version};
use std::{collections::{HashMap, HashSet}, default, fmt::Debug};
use thiserror::Error;

use crate::helpers::directive_args_as_map;

#[derive(Debug, PartialEq)]
struct FederationTypeMetadata<'q> {
    is_value_type: HashMap<Pos, bool>,
    keys: HashMap<Pos, HashMap<String, Vec<query::SelectionSet<'q>>>>,
    owner: HashMap<Pos, String>,
}

impl<'q> FederationTypeMetadata<'q> {
    pub(crate) fn new() -> Self {
        Self {
            is_value_type: HashMap::new(),
            keys: HashMap::new(),
            owner: HashMap::new(),
        }
    }
}

#[derive(Debug, PartialEq)]
struct FederationFieldMetadata<'q> {
    service_name: HashMap<Pos, String>,
    requires: HashMap<Pos, query::SelectionSet<'q>>,
    provides: HashMap<Pos, query::SelectionSet<'q>>,
}

impl<'q> FederationFieldMetadata<'q> {
    pub(crate) fn new() -> Self {
        Self {
            service_name: HashMap::new(),
            requires: HashMap::new(),
            provides: HashMap::new(),
        }
    }
}

#[derive(Clone, Copy)]
pub(crate) enum SpecVersion {
    V0_1,
}

struct Resolve<'q> {
    graph: String,
    requires: Option<query::SelectionSet<'q>>,
    provides: Option<query::SelectionSet<'q>>,
}

struct Cs {
    key_directive: String,
    field_directive: String,
    graph_enum: String,
}

#[derive(Debug, Error, Eq, PartialEq)]
pub enum FederationError {
    #[error("could not find supported federation metadata in schema")]
    NotFound,

    #[error("type not found")]
    TypeNotFound(Pos, String),

    #[error("{0} no graph was specified on resolve directive")]
    ResolveNoGraph(Pos),

    #[error("{0} fragment \"{1}\" not found in schema")]
    FragmentNotFound(Pos, String),
}

impl Cs {
    fn new(prefix: &str) -> Cs {
        Cs {
            key_directive: format!("{}__key", prefix),
            field_directive: format!("{}__field", prefix),
            graph_enum: format!("{}__Graph", prefix),
        }
    }

    fn graphs<'a>(&self, schema: &'a Document<'a>) -> HashMap<&'a str, &'a EnumValue<'a>> {
        schema.definitions.iter()
            .filter_map(|d| match d {
                Definition::Type(TypeDefinition::Enum(e)) if e.name == self.graph_enum =>
                    Some(e.values.iter().map(
                        |val| (val.name, val)
                    )),
                _ => None
            })
            .flatten()
            .collect()
    }

    fn key_definitions<'a>(&self, fragment: &'a FragmentDefinition<'a>) -> HashSet<&'a str> {
        fragment.directives.iter()
            .filter_map(|d|
                if d.name == self.key_directive {
                    Some(
                        d.arguments.iter()
                            .filter_map(|(arg, val)| match *arg {
                                "graph" => Some(val),
                                _ => None
                            })                                   
                    )
                } else {
                    None
                }
            )
            .flatten()
            .filter_map(|val| match val {
                Value::Enum(val) => Some(*val),
                _ => None,
            })
            .collect()
    }

    fn resolve<'a, 'q>(&self,
        field: &'a Field<'q>,
        fragments: &'a HashMap<&'q str, (&'q FragmentDefinition, HashSet<&'q str>)>,
        errors: &mut Vec<FederationError>) -> Option<Resolve<'q>>
    {
        field.directives.iter()
            .filter(|d| d.name == self.field_directive)
            .filter_map(|d| {
                let mut graph = None;
                let mut requires = None;
                let mut provides = None;
                for argument in d.arguments.iter() {
                    match argument {
                        ("graph", Value::Enum(val)) => { graph = Some(val); },
                        ("requires", Value::String(val)) => match fragments.get(val.as_str()) {
                            Some((frag, _)) => {
                                requires = Some(frag.selection_set.clone());
                            },
                            _ => {
                                errors.push(FederationError::FragmentNotFound(d.position, val.to_string()))
                            }
                        },
                        ("provides", Value::String(val)) => match fragments.get(val.as_str()) {
                            Some((frag, _)) => {
                                provides = Some(frag.selection_set.clone());
                            },
                            _ => {
                                errors.push(FederationError::FragmentNotFound(d.position, val.to_string()))
                            }
                        },                        
                        _ => {},
                    }    
                }
                graph.map(|graph| Resolve {
                    graph: graph.to_string(),
                    requires,
                    provides,
                }).or_else(|| {
                    errors.push(FederationError::ResolveNoGraph(d.position));
                    None
                })
            })
            .next()
    }
}

impl SpecVersion {
    fn apply<'q>(self, schema: &'q Schema<'q>, request: &Request) -> Federation<'q> {
        let doc = &schema.document;
        let mut types = FederationTypeMetadata::new();
        let mut fields = FederationFieldMetadata::new();
        let mut errors = Vec::new();

        let cs = Cs::new(&request.prefix);
        let graphs = cs.graphs(doc);

        // Collect a map of (type name -> &ObjectType)
        let obj_types: HashMap<_, _> = doc.definitions.iter()
            .filter_map(|d| match d {
                Definition::Type(TypeDefinition::Object(obj)) => Some((obj.name, obj)),
                _ => None,
            })
            .collect();
        
        // Collect a map of fragment names -> (&FragmentDefinition, graphs for which this fragment is a key)
        let fragments: HashMap<_, _> = doc.definitions.iter()
            .filter_map(|d| match d {
                Definition::Fragment(frag) => Some((frag.name, (frag, cs.key_definitions(frag)))),
                _ => None,
            })
            .collect();

        // Iterate over fragments and collect keys for each type
        for (frag, graph_keys) in fragments.values() {
            let typ = match obj_types.get(frag.type_condition) {
                Some(t) => *t,
                None => {
                    errors.push(FederationError::TypeNotFound(frag.position, frag.type_condition.to_string()));
                    continue
                }
            };
            for graph in graph_keys {
                types.keys
                    .entry(typ.position).or_default()
                    .entry(graph.to_string()).or_default()
                    .push(frag.selection_set.clone());
            }
        }

        // Scan resolve information from composed schema directives
        let resolves = obj_types.values()
            .flat_map(|t| t.fields.iter())
            .filter_map(|field|
                cs.resolve(field, &fragments, &mut errors)
                    .map(|resolve| (field, resolve)));
        
        // Update this frankly kindof stupid data structure
        // TODO(ashik): make less stupid
        for (field, resolve) in resolves {
            let pos = field.position;
            // println!("field at {:?} {}: {}", field.position, &field.name, &resolve.graph);
            fields.service_name.insert(pos, resolve.graph.to_string());
            match resolve.requires {
                Some(sel) => { fields.requires.insert(pos, sel); },
                _ => {},
            }
            match resolve.provides {
                Some(sel) => { fields.provides.insert(pos, sel); },
                _ => {},
            }
        }

        let fields_for_type = obj_types.values()
            .map(|typ| (
                typ.position,
                typ.fields.iter()
                    .map(|field| (field.name, field))
                    .collect::<HashMap<_, _>>()
            ))
            .collect::<HashMap<_, _>>();

        for typ in obj_types.values() {
            let keys = match types.keys.get(&typ.position) {
                Some(keys) => keys.values(),
                None => {
                    types.is_value_type.insert(
                        typ.position,
                        typ.fields.iter().all(|f| !fields.service_name.contains_key(&f.position))
                    );
                    // types.is_value_type.insert(typ.position, true);
                    continue
                }
            };

            let possible_owners: HashSet<&String> =
                keys.flat_map(|sels| sels.iter())
                    .flat_map(|sel| sel.items.iter())
                    .filter_map(|sel| match sel {
                        query::Selection::Field(f) =>
                            Some(fields_for_type.get(&typ.position)?
                                .get(&f.name)?
                                .position),
                        query::Selection::FragmentSpread(_) => todo!(
                            "Fragment spreads are not currently supported in keys"
                        ),
                        query::Selection::InlineFragment(_) => todo!(
                            "Inline fragments are not currently supported in keys"
                        ),
                    })
                    .filter_map(|pos| fields.service_name.get(&pos))
                    .collect();
            match (possible_owners.len(), possible_owners.iter().next()) {
                (0, _) => { types.is_value_type.insert(typ.position, true); },
                (1, Some(owner)) => { types.owner.insert(typ.position, owner.to_string()); }
                _ => {
                    println!(
                        "(free types) multiple possible owners for {typ}: {owners}",
                        typ = typ.name,
                        owners = &possible_owners.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(", ")
                    );
                    todo!("free types");
                }
            }
        }

        // for obj_type in obj_types {
        //     // Populate type metadata
        //     {
        //         // value type / owner
        //         match get_directive!(obj_type.directives, "owner").next() {
        //             Some(owner_directive) => {
        //                 types.is_value_type.insert(obj_type.position, false);
        //                 let graph = letp!((_, Value::String(graph)) = &owner_directive.arguments[0] => graph.clone());
        //                 types.owner.insert(obj_type.position, graph);
        //             }
        //             None => {
        //                 types.is_value_type.insert(obj_type.position, true);
        //             }
        //         }

        //         // keys
        //         let mut keys_for_obj: HashMap<String, Vec<query::SelectionSet<'q>>> =
        //             HashMap::new();

        //         let graph_to_key_tuples = get_directive!(obj_type.directives, "key")
        //             .map(|key_dir| directive_args_as_map(&key_dir.arguments))
        //             .map(|args| {
        //                 (
        //                     String::from(args["graph"]),
        //                     as_selection_set_ref(args["fields"]),
        //                 )
        //             });

        //         for (graph, key) in graph_to_key_tuples {
        //             keys_for_obj.entry(graph).or_insert_with(Vec::new).push(key)
        //         }

        //         types.keys.insert(obj_type.position, keys_for_obj);
        //     }

        //     // Populate field metadata
        //     {
        //         for field in obj_type.fields.iter() {
        //             for d in field.directives.iter() {
        //                 match d.name {
        //                     "requires" => {
        //                         let requires = letp!((_, Value::String(requires)) = &d.arguments[0] => requires);
        //                         fields
        //                             .requires
        //                             .insert(field.position, as_selection_set_ref(requires));
        //                     }
        //                     "provides" => {
        //                         let provides = letp!((_, Value::String(provides)) = &d.arguments[0] => provides);
        //                         fields
        //                             .provides
        //                             .insert(field.position, as_selection_set_ref(provides));
        //                     }
        //                     "resolve" => {
        //                         let graph = letp!((_, Value::String(graph)) = &d.arguments[0] => graph.clone());
        //                         fields.service_name.insert(field.position, graph);
        //                     }
        //                     _ => (),
        //                 }
        //             }

        //             // For serivce_name, fallback to owner of type if it's there.
        //             if !fields.service_name.contains_key(&field.position) {
        //                 if let Some(graph) = types.owner.get(&obj_type.position) {
        //                     fields.service_name.insert(field.position, graph.clone());
        //                 }
        //             }
        //         }
        //     }
        // }

        Federation { types, fields, errors }
    }
}

#[derive(Debug, PartialEq)]
pub(crate) struct Federation<'q> {
    types: FederationTypeMetadata<'q>,
    fields: FederationFieldMetadata<'q>,
    errors: Vec<FederationError>,
}

pub const CS_SPEC_ID: &'static str = "https://lib.apollo.dev/join";

lazy_static! {
    static ref IMPLEMENTATIONS: Implementations<SpecVersion> = Implementations::new()
        .provide(CS_SPEC_ID, Version(0, 1), SpecVersion::V0_1);
}

impl<'q> Federation<'q> {
    pub(crate) fn new<'a: 'q>(schema: &'a Schema<'q>) -> Result<Federation<'q>, FederationError> {
        let specified = schema.activations(&*IMPLEMENTATIONS)
            .filter_map(|(req, found)|
                found.last()
                    .map(|(_, spec)| (req, spec))
            )
            .last()
            .map(|(req, spec)| (req.to_owned(), spec.to_owned()));
        specified.map(|(req, spec)|
            spec.apply(&schema, &req)
        ).ok_or(FederationError::NotFound)
    }

    pub(crate) fn service_name_for_field<'a>(&'a self, field_def: &'q Field<'q>) -> Option<String> {
        self.fields.service_name.get(&field_def.position).cloned()
    }

    pub(crate) fn requires<'a>(&'a self, field_def: &'q Field<'q>) -> Option<SelectionSetRef<'a>> {
        self.fields
            .requires
            .get(&field_def.position)
            .map(SelectionSetRef::from)
    }

    pub(crate) fn provides<'a>(&'a self, field_def: &'q Field<'q>) -> Option<SelectionSetRef<'a>> {
        self.fields
            .provides
            .get(&field_def.position)
            .map(SelectionSetRef::from)
    }

    pub(crate) fn service_name_for_type<'a>(
        &'a self,
        object_type: &'q ObjectType<'q>,
    ) -> Option<String> {
        self.types.owner.get(&object_type.position).cloned()
    }

    pub(crate) fn key<'a>(
        &'a self,
        object_type: &'q ObjectType<'q>,
        service_name: &str,
    ) -> Option<Vec<SelectionSetRef<'a>>> {
        self.types
            .keys
            .get(&object_type.position)
            .and_then(|keys_map| {
                keys_map
                    .get(service_name)
                    .map(|v| v.iter().map(SelectionSetRef::from).collect())
            })
    }

    pub(crate) fn is_value_type<'a>(&'a self, parent_type: &'q TypeDefinition<'q>) -> bool {
        if let TypeDefinition::Object(object_type) = parent_type {
            self.types.is_value_type.get(&object_type.position)
                .map(|x| *x)
                .unwrap_or_default()
        } else {
            true
        }
    }
}

fn as_selection_set_ref(value: &str) -> query::SelectionSet {
    let ss = parse_query(value)
        .expect("failed parsing directive value as selection set")
        .definitions
        .pop()
        .unwrap();
    letp!(query::Definition::SelectionSet(ss) = ss => ss)
}
