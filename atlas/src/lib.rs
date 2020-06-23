use std::{sync::Arc, collections::HashMap, ops::Index};
use graphql_parser::{query::Operation, schema::{Document, Definition, parse_schema, ParseError, TypeDefinition, TypeExtension, Named, Field, EnumValue, InputValue}};

mod id;
pub use id::*;

// mod graph;

#[derive(Debug, PartialEq)]
pub struct Node {
    kind: Kind,
    name: Option<String>,
    edges: Edges,
}

pub type Edges = HashMap<Edge, Nodes>;
pub type Nodes = Vec<Arc<Node>>;

trait Select {
    fn sel(&self, edge: &Edge) -> Nodes;
    fn child(&self, name: &str) -> Nodes {
        self.sel(&Edge::name(name))
    }
}

impl Select for Node {
    fn sel(&self, edge: &Edge) -> Nodes {
        self.edges.get(edge).unwrap_or(&vec![]).clone()
    }
}


impl Select for Nodes {
    fn sel(&self, edge: &Edge) -> Nodes {
        self.iter().flat_map(|n| {
            let nodes = n.sel(edge);
            nodes.into_iter().map(|ns| Arc::clone(&ns))
        }).collect()
    }
}

trait Query {
    type Output;
    fn query(&self, root: &Id) -> Self::Output;
}

impl Identified for Id {
    fn id(&self) -> Id { *self }
}

impl Id {
    fn get<'a, Q: Query>(&self, index: &'a Q) -> Q::Output {
        index.query(self)
    }
}

struct Children(HashMap<Id, HashMap<String, Vec<Id>>>);

impl Children {
    fn named<'a>(&'a self, name: &str) -> ChildrenNamed<'a> {
        ChildrenNamed {
            children: self,
            name: name.into()
        }
    }
}

struct ChildrenNamed<'a> {
    children: &'a Children,
    name: String
}

impl<'a> Query for ChildrenNamed<'a> {
    type Output = Option<&'a Vec<Id>>;

    fn query(&self, root: &Id) -> Self::Output {
        match self.children.0.get(root) {
            Some(kids) => kids.get(&self.name),
            None => None,
        }
    }
}


struct Parsed {
    root: Id,
    children: Children,
}

impl Parsed {
    pub fn parse_schema(source: &str) -> Result<Parsed, ParseError> {
        let schema = parse_schema(source)?;
        let root = Id::new();
        let mut children = Children(HashMap::new());
        index_children(&children, &schema, &root);
        Ok(Parsed { root, children })
    }
}

fn index_children<'a, T: AsNode + Named<'a>>(children: &mut Children, schema: &T, root: &Id) {
    
}



trait Parent<C: Parent<C>> {
    fn children<'a>(&'a self) -> &'a Vec<C>;
}

impl<'a> Parent<Definition<'a>> for {
    fn children<'a>(&'a self) -> Edges {
        match self {
            Definition::Schema(_) => empty!(),
            Definition::Type(t) => match t {
                TypeDefinition::Scalar(_) => empty!(),
                TypeDefinition::Object(o) => index_names(&o.fields),
                TypeDefinition::Interface(i) => index_names(&i.fields),
                TypeDefinition::Union(_) => HashMap::new(),
                TypeDefinition::Enum(en) => index_names(&en.values),
                TypeDefinition::InputObject(io) => index_names(&io.fields),
            },
            Definition::TypeExtension(_) => empty!(),
            Definition::Directive(_) => empty!(),
            Definition::Operation(_) => empty!(),
            Definition::Fragment(_) => empty!(),
        }
    }   
}


// fn index_names<'a, T>(col: &Vec<T>) -> Edges
// where T: AsNode + Named<'a>
// {
//     let mut edges = Edges::new();
//     for child in col {
//         if let (Some(name), Some(point)) = (child.name(), child.node()) {
//             let family = edges.entry(Edge::name(name))
//                 .or_insert(vec![]);
//             family.push(Arc::new(point));
//         }
//     }
//     edges
// }



#[derive(Debug, Clone, Eq, PartialEq, Hash)]
pub enum Edge {
    Name(String),
}

impl Edge {
    pub fn name(name: &str) -> Edge {
        Edge::Name(String::from(name))
    }
}


#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Kind {
    Schema,
    Scalar(Ext),
    Object(Ext),
    Interface(Ext),
    Union(Ext),
    Enum(Ext),
    EnumValue,
    InputObject(Ext),
    InputValue,
    Directive,
    Operation(Operation),
    Fragment,
    Field,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Ext {
    Definition,
    Extension,
}

impl Node {
    pub fn parse_schema(source: &str, name: Option<String>) -> Result<Arc<Node>, ParseError> {
        let mut point = parse_schema(source)?.node().unwrap();
        point.name = name;
        Ok(Arc::new(point))
    }
}

fn index_names<'a, T>(col: &Vec<T>) -> Edges
where T: AsNode + Named<'a>
{
    let mut edges = Edges::new();
    for child in col {
        if let (Some(name), Some(point)) = (child.name(), child.node()) {
            let family = edges.entry(Edge::name(name))
                .or_insert(vec![]);
            family.push(Arc::new(point));
        }
    }
    edges
}

trait AsNode {
    fn node(&self) -> Option<Node> { None }
    fn edges(&self) -> Edges { Edges::new() }
}

impl<'a> AsNode for Document<'a> {
    fn node(&self) -> Option<Node> {
        Some(Node {
            kind: Kind::Schema,
            name: None,
            edges: self.edges(),
        })
    }

    fn edges(&self) -> Edges {
        index_names(&self.definitions)
    }
}

impl<'a> AsNode for Field<'a> {
    fn node(&self) -> Option<Node> {
        Some(Node {            
            kind: Kind::Field,
            name: Some(String::from(self.name)),
            edges: self.edges()
        })
    }
}

impl<'a> AsNode for EnumValue<'a> {
    fn node(&self) -> Option<Node> {
        Some(Node {
            kind: Kind::EnumValue,
            name: Some(String::from(self.name)),
            edges: HashMap::new(),
        })
    }
}


impl<'a> AsNode for InputValue<'a> {
    fn node(&self) -> Option<Node> {
        Some(Node {
            kind: Kind::InputValue,
            name: Some(String::from(self.name)),
            edges: HashMap::new(),
        })
    }
}

macro_rules! empty {
    () => { Edges::new() }
}

impl<'a> AsNode for Definition<'a> {
    fn node(&self) -> Option<Node> {
        Some(Node {
            kind: match self {
                Definition::Schema(_) => { return None }
                Definition::Type(def) => match def {
                    TypeDefinition::Scalar(_) => Kind::Scalar(Ext::Definition),
                    TypeDefinition::Object(_) => Kind::Object(Ext::Definition),
                    TypeDefinition::Interface(_) => Kind::Interface(Ext::Definition),
                    TypeDefinition::Union(_) => Kind::Union(Ext::Definition),
                    TypeDefinition::Enum(_) => Kind::Enum(Ext::Definition),
                    TypeDefinition::InputObject(_) => Kind::InputObject(Ext::Definition)
                }
                Definition::TypeExtension(ext) => match ext {
                    TypeExtension::Scalar(_) => Kind::Scalar(Ext::Extension),
                    TypeExtension::Object(_) => Kind::Object(Ext::Extension),
                    TypeExtension::Interface(_) => Kind::Interface(Ext::Extension),
                    TypeExtension::Union(_) => Kind::Union(Ext::Extension),
                    TypeExtension::Enum(_) => Kind::Enum(Ext::Extension),
                    TypeExtension::InputObject(_) => Kind::InputObject(Ext::Extension),
                }
                Definition::Directive(_) => Kind::Directive,
                Definition::Operation(op) => Kind::Operation(op.kind),
                Definition::Fragment(_) => Kind::Fragment,
            },
            name: self.name().map(|n| n.to_owned()),
            edges: self.edges(),
        })
    }

    fn edges(&self) -> Edges {
        match self {
            Definition::Schema(_) => empty!(),
            Definition::Type(t) => match t {
                TypeDefinition::Scalar(_) => empty!(),
                TypeDefinition::Object(o) => index_names(&o.fields),
                TypeDefinition::Interface(i) => index_names(&i.fields),
                TypeDefinition::Union(_) => HashMap::new(),
                TypeDefinition::Enum(en) => index_names(&en.values),
                TypeDefinition::InputObject(io) => index_names(&io.fields),
            },
            Definition::TypeExtension(_) => empty!(),
            Definition::Directive(_) => empty!(),
            Definition::Operation(_) => empty!(),
            Definition::Fragment(_) => empty!(),
        }
    }    
}


#[test]
fn parses_graphql() -> Result<(), ParseError> {
    use crate::{Node, Edge};
    let text = "
        type User {
            id: String
            name: Int
            favorites: Faves
        }

        type Faves {
            color: String
        }
    ";

    let schema = Node::parse_schema(text, None)?;
    let user = schema.child("User");
    let faves = schema.child("Faves")[0];
    {
        let favorites = &schema.child("User").child("favorites")[0];
        for (edge, val) in faves.edges.iter() {
            
        }
    }
    assert_eq!(user[0].kind, Kind::Object(Ext::Definition), "it's an object type");
    assert_eq!(user.sel(&Edge::name("id"))[0].kind, Kind::Field, "has an id field");
    assert_eq!(user.child("name")[0].kind, Kind::Field, "has a name field");

    // assert_eq!(schema.child("User").child("name").kind(), vec![Kind::Field], "has one name field");
    Ok(())
}
