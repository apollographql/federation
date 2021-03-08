use graphql_parser::query::refs::SelectionSetRef;
use graphql_parser::schema::*;
use graphql_parser::{parse_query, Pos};
use graphql_parser::{query, Name};
use std::{
    collections::{HashMap, HashSet},
    default,
    fmt::Debug,
};
use thiserror::Error;
use using::{Implementations, Request, Schema, Version};

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

struct Join<'q> {
    graph: String,
    requires: Option<query::SelectionSet<'q>>,
    provides: Option<query::SelectionSet<'q>>,
}

struct Cs {
    key_directive: String,
    field_directive: String,
    graph_enum: String,
}

type Id = Pos;
type GraphId = Id;
type TypeId = Id;
type FieldId = Id;

fn typename<'a>(typ: &'a Type<'a>) -> &'a str {
    match typ {
        Type::NamedType(n) => n,
        Type::ListType(lt) => typename(lt.as_ref()),
        Type::NonNullType(nn) => typename(nn.as_ref()),
    }
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
            field_directive: prefix.to_string(),
            graph_enum: format!("{}__Graph", prefix),
        }
    }

    fn graphs<'a>(&self, schema: &'a Document<'a>) -> HashMap<&'a str, &'a EnumValue<'a>> {
        schema
            .definitions
            .iter()
            .filter_map(|d| match d {
                Definition::Type(TypeDefinition::Enum(e)) if e.name == self.graph_enum => {
                    Some(e.values.iter().map(|val| (val.name, val)))
                }
                _ => None,
            })
            .flatten()
            .collect()
    }

    fn key_definitions<'a>(&self, fragment: &'a FragmentDefinition<'a>) -> HashSet<&'a str> {
        fragment
            .directives
            .iter()
            .filter_map(|d| {
                if d.name == self.key_directive {
                    Some(d.arguments.iter().filter_map(|(arg, val)| match *arg {
                        "graph" => Some(val),
                        _ => None,
                    }))
                } else {
                    None
                }
            })
            .flatten()
            .filter_map(|val| match val {
                Value::Enum(val) => Some(*val),
                _ => None,
            })
            .collect()
    }

    // fn realized<'a>(&self, schema: &'a Schema<'a>, errors: &mut Vec<FederationError>) {
    //     let type_fields = schema.document.definitions.iter().filter_map(
    //         |def| match def {
    //             // Definition::Schema(SchemaDefinition { position, ..  }) => position,
    //             Definition::Type(td) => match td {
    //                 TypeDefinition::Object(ObjectType { position, name, fields,  ..}) =>
    //                     Some((position, name, fields)),
    //                 TypeDefinition::Interface(InterfaceType { position, name, fields, ..}) =>
    //                     Some((position, name, fields)),
    //                 _ => None,
    //             },
    //             _ => None,
    //         }
    //     );

    //     let fragments = self.fragments(&schema.document);

    //     let mut type_joins: HashMap<String, HashSet<String>> = HashMap::new();
    //     let mut realized: HashMap<(String, String), Vec<String>> = HashMap::new();

    //     for (_type_id, type_name, fields) in type_fields {
    //         for field in fields {
    //             let name = typename(&field.field_type);
    //             let graph = self.joins(field, &fragments, errors)
    //                 .map(|r| r.graph.to_string())
    //                 .unwrap_or_else(|| "*".to_string());
    //             realized.entry((graph.to_string(), name.to_string()))
    //                 .or_default()
    //                 .push(format!("{}.{}", type_name, field.name));
    //             type_joins.entry(type_name.to_string())
    //                 .or_default()
    //                 .insert(graph);
    //         }
    //     }
    // }

    fn fragments<'a>(&self, doc: &'a Document<'a>) -> HashMap<&'a str, &'a FragmentDefinition<'a>> {
        doc.definitions
            .iter()
            .filter_map(|d| match d {
                Definition::Fragment(frag) => Some((frag.name, frag)),
                _ => None,
            })
            .collect()
    }

    fn joins<'a, 'q>(
        &self,
        directives: &Vec<Directive<'q>>,
        fragments: &'a HashMap<&'q str, &'q FragmentDefinition>,
        errors: &mut Vec<FederationError>,
    ) -> Vec<Join<'q>> {
        directives
            .iter()
            .filter(|d| d.name == self.field_directive)
            .filter_map(|d| {
                let mut graph = None;
                let mut requires = None;
                let mut provides = None;
                for argument in d.arguments.iter() {
                    match argument {
                        ("graph", Value::Enum(val)) => {
                            graph = Some(val);
                        }
                        ("requires", Value::String(val)) => match fragments.get(val.as_str()) {
                            Some(frag) => {
                                requires = Some(frag.selection_set.clone());
                            }
                            _ => errors.push(FederationError::FragmentNotFound(
                                d.position,
                                val.to_string(),
                            )),
                        },
                        ("provides", Value::String(val)) => match fragments.get(val.as_str()) {
                            Some(frag) => {
                                provides = Some(frag.selection_set.clone());
                            }
                            _ => errors.push(FederationError::FragmentNotFound(
                                d.position,
                                val.to_string(),
                            )),
                        },
                        _ => {}
                    }
                }
                graph
                    .map(|graph| Join {
                        graph: graph.to_string(),
                        requires,
                        provides,
                    })
                    .or_else(|| {
                        errors.push(FederationError::ResolveNoGraph(d.position));
                        None
                    })
            })
            .collect()
    }
}

impl SpecVersion {
    fn apply<'q>(self, schema: &'q Schema<'q>, request: &Request) -> Federation<'q> {
        let doc = &schema.document;
        let mut types = FederationTypeMetadata::new();
        let mut fields = FederationFieldMetadata::new();
        let mut errors = Vec::new();

        let cs = Cs::new(&request.prefix);
        // let graphs = cs.graphs(doc);

        // Collect a map of (type name -> &ObjectType)
        let obj_types: HashMap<_, _> = doc
            .definitions
            .iter()
            .filter_map(|d| match d {
                Definition::Type(TypeDefinition::Object(obj)) => Some((obj.name, obj)),
                _ => None,
            })
            .collect();

        // Collect a map of fragment names -> &FragmentDefinition
        let fragments: HashMap<_, _> = cs.fragments(doc);

        // Collect fields for each type
        let fields_for_type = obj_types
            .values()
            .map(|typ| {
                (
                    typ.position,
                    typ.fields
                        .iter()
                        .map(|field| (field.name, field))
                        .collect::<HashMap<_, _>>(),
                )
            })
            .collect::<HashMap<_, _>>();

        // Scan join information from directives
        let type_joins: HashMap<_, _> = obj_types
            .values()
            .map(|typ| {
                (
                    typ.position,
                    cs.joins(&typ.directives, &fragments, &mut errors),
                )
            })
            .collect();

        for (type_id, joins) in &type_joins {
            for Join {
                graph, requires, ..
            } in joins
            {
                if let Some(key) = requires {
                    types
                        .keys
                        .entry(*type_id)
                        .or_default()
                        .entry(graph.to_string())
                        .or_default()
                        .push(key.clone())
                }
            }
        }

        let obj_fields = obj_types.values().flat_map(|t| t.fields.iter());

        // Update this frankly kindof stupid data structure
        // TODO(ashik): make less stupid
        for field in obj_fields {
            let pos = field.position;
            let joins = cs.joins(&field.directives, &fragments, &mut errors);
            if let Some(resolve) = joins.get(0) {
                fields.service_name.insert(pos, resolve.graph.to_string());
                match &resolve.requires {
                    Some(sel) => {
                        fields.requires.insert(pos, sel.clone());
                    }
                    _ => {}
                };
                match &resolve.provides {
                    Some(sel) => {
                        fields.provides.insert(pos, sel.clone());
                    }
                    _ => {}
                };
            }
        }

        for typ in obj_types.values() {
            let keys = match types.keys.get(&typ.position) {
                Some(keys) => keys.values(),
                None => continue,
            };

            let possible_owners: HashSet<&String> = keys
                .flat_map(|sels| sels.iter())
                .flat_map(|sel| sel.items.iter())
                .filter_map(|sel| match sel {
                    query::Selection::Field(f) => {
                        Some(fields_for_type.get(&typ.position)?.get(&f.name)?.position)
                    }
                    _ => None,
                })
                .filter_map(|pos| fields.service_name.get(&pos))
                .collect();
            match (possible_owners.len(), possible_owners.iter().next()) {
                (0, _) => {
                    types.is_value_type.insert(typ.position, true);
                }
                (1, Some(owner)) => {
                    types.owner.insert(typ.position, owner.to_string());
                    types.is_value_type.insert(typ.position, false);
                }
                _ => {
                    println!(
                        "(free types) multiple possible owners for {typ}: {owners}",
                        typ = typ.name,
                        owners = &possible_owners
                            .iter()
                            .map(|s| s.as_str())
                            .collect::<Vec<_>>()
                            .join(", ")
                    );
                    todo!("free types");
                }
            }
        }

        for typ in obj_types.values() {
            // Assign all other object types to be value types?
            types.is_value_type.entry(typ.position).or_insert(true);
        }
        Federation {
            types,
            fields,
            errors,
        }
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
    static ref IMPLEMENTATIONS: Implementations<SpecVersion> =
        Implementations::new().provide(CS_SPEC_ID, Version(0, 1), SpecVersion::V0_1);
}

impl<'q> Federation<'q> {
    pub(crate) fn new<'a: 'q>(schema: &'a Schema<'q>) -> Result<Federation<'q>, FederationError> {
        let specified = schema
            .activations(&*IMPLEMENTATIONS)
            .filter_map(|(req, found)| found.last().map(|(_, spec)| (req, spec)))
            .last()
            .map(|(req, spec)| (req.to_owned(), spec.to_owned()));
        specified
            .map(|(req, spec)| spec.apply(&schema, &req))
            .ok_or(FederationError::NotFound)
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
        let result = if let TypeDefinition::Object(object_type) = parent_type {
            self.types
                .is_value_type
                .get(&object_type.position)
                .map(|x| *x)
                .unwrap_or_default()
        } else {
            true
        };
        result
    }
}
