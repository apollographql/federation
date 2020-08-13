use graphql_parser::query;
use graphql_parser::query::refs::SelectionSetRef;
use graphql_parser::schema::*;
use graphql_parser::{parse_query, Pos};
use std::collections::HashMap;

#[derive(Debug, PartialEq)]
struct FederationTypeMetadata<'q> {
    is_value_type: HashMap<Pos, bool>,
    keys: HashMap<Pos, HashMap<String, Vec<query::SelectionSet<'q>>>>,
    owner: HashMap<Pos, String>,
}

impl<'q> FederationTypeMetadata<'q> {
    pub fn new() -> Self {
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
    pub fn new() -> Self {
        Self {
            service_name: HashMap::new(),
            requires: HashMap::new(),
            provides: HashMap::new(),
        }
    }
}

#[derive(Debug, PartialEq)]
pub struct Federation<'q> {
    types: FederationTypeMetadata<'q>,
    fields: FederationFieldMetadata<'q>,
}

impl<'q> Federation<'q> {
    pub fn new(schema: &'q Document<'q>) -> Federation<'q> {
        let mut types = FederationTypeMetadata::new();
        let mut fields = FederationFieldMetadata::new();

        let obj_types = schema.definitions.iter().flat_map(|d| {
            if let Definition::Type(TypeDefinition::Object(obj)) = d {
                Some(obj)
            } else {
                None
            }
        });

        for obj_type in obj_types {
            // Populate type metadata
            {
                // value type / owner
                match get_directive!(obj_type.directives, "owner").next() {
                    Some(owner_directive) => {
                        types.is_value_type.insert(obj_type.position, false);
                        let graph = letp!((_, Value::String(graph)) = &owner_directive.arguments[0] => graph.clone());
                        types.owner.insert(obj_type.position, graph);
                    }
                    None => {
                        types.is_value_type.insert(obj_type.position, true);
                    }
                }

                // keys
                let mut keys_for_obj: HashMap<String, Vec<query::SelectionSet<'q>>> =
                    HashMap::new();

                let graph_to_key_tuples = get_directive!(obj_type.directives, "key")
                    .map(|key_dir| directive_args_as_map(&key_dir.arguments))
                    .map(|args| {
                        (
                            String::from(args["graph"]),
                            as_selection_set_ref(args["fields"]),
                        )
                    });

                for (graph, key) in graph_to_key_tuples {
                    keys_for_obj.entry(graph).or_insert(vec![]).push(key)
                }

                types.keys.insert(obj_type.position, keys_for_obj);
            }

            // Populate field metadata
            {
                for field in obj_type.fields.iter() {
                    for d in field.directives.iter() {
                        match d.name {
                            "requires" => {
                                let requires = letp!((_, Value::String(requires)) = &d.arguments[0] => requires);
                                fields
                                    .requires
                                    .insert(field.position, as_selection_set_ref(requires));
                            }
                            "provides" => {
                                let provides = letp!((_, Value::String(provides)) = &d.arguments[0] => provides);
                                fields
                                    .provides
                                    .insert(field.position, as_selection_set_ref(provides));
                            }
                            "resolve" => {
                                let graph = letp!((_, Value::String(graph)) = &d.arguments[0] => graph.clone());
                                fields.service_name.insert(field.position, graph);
                            }
                            _ => (),
                        }
                    }

                    // For serivce_name, fallback to owner of type if it's there.
                    if !fields.service_name.contains_key(&field.position) {
                        if let Some(graph) = types.owner.get(&obj_type.position) {
                            fields.service_name.insert(field.position, graph.clone());
                        }
                    }
                }
            }
        }

        Federation { types, fields }
    }

    pub fn service_name_for_field<'a>(&'a self, field_def: &'q Field<'q>) -> Option<String> {
        self.fields
            .service_name
            .get(&field_def.position)
            .map(|s| s.clone())
    }

    pub fn requires<'a>(&'a self, field_def: &'q Field<'q>) -> Option<SelectionSetRef<'a>> {
        self.fields
            .requires
            .get(&field_def.position)
            .map(SelectionSetRef::from)
    }

    pub fn provides<'a>(&'a self, field_def: &'q Field<'q>) -> Option<SelectionSetRef<'a>> {
        self.fields
            .provides
            .get(&field_def.position)
            .map(SelectionSetRef::from)
    }

    pub fn service_name_for_type<'a>(&'a self, object_type: &'q ObjectType<'q>) -> Option<String> {
        self.types
            .owner
            .get(&object_type.position)
            .map(|s| s.clone())
    }

    pub fn key<'a>(
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

    pub fn is_value_type<'a>(&'a self, object_type: &'q ObjectType<'q>) -> bool {
        self.types.is_value_type[&object_type.position]
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

fn directive_args_as_map<'q>(args: &'q Vec<(Txt<'q>, Value<'q>)>) -> HashMap<Txt<'q>, Txt<'q>> {
    args.iter()
        .map(|(k, v)| {
            let str = letp!(Value::String(str) = v => str);
            (*k, str.as_str())
        })
        .collect()
}

// lazy_static! {
//     static ref STRINGS: Mutex<Vec<String>> = Mutex::new(vec![]);
// }
