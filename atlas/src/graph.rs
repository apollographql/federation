use std::{hash::Hash, collections::HashMap, sync::Arc};

use crate::{Id, Identified};
// pub struct Col<R: Identified> {
//   rows: Vec<R>
// }

trait Col {
  type Row;
}

pub struct Planner {
  schema: Schema
}

struct Schema {}
struct Query {}

impl Planner {
  fn plan(&self, query: Query) {
    query.fields.map(|f| self.schema.query.field(f.name))

  }
}


// schema.query.get(child.by_name(f.name)).get(federation)

trait Sel {
  fn get<R, C: Col<Row=R>>(from: C) -> R;
}

impl Col for Schema {
  type Row = String;
}

impl Sel for Query {}

fn bloop(q: Query) {
  
}

pub enum ListOp<T: Identified> {
  Insert { item: T, at: Position },
  Delete { item_id: Id },
  Clear,
}
pub enum Position {
  AtStart, Before(Id), After(Id), AtEnd
}

impl<T: Identified> Col<T> {
  fn apply(&mut self, op: ListOp<T>) {
    match op {
        ListOp::Insert { item, at } => match at {
            Position::AtStart => {}
            Position::Before(_) => {}
            Position::After(_) => {}
            Position::AtEnd => {}
        },
        ListOp::Delete { item_id } => {

        },
        ListOp::Clear => {
          self.rows.clear()
        },
    }
  }
}


pub struct Field {
  of: Id,
  name: String,
  field: Id,
}



// impl<'a, T: Hash + Eq> DirectedLayer<'a, T> {
//   fn append(&mut self, edge: Edge<T>) {
//     self.edges.push(edge);
//     let e: &'a Edge<T> = self.edges.last().unwrap(); 
//     use std::collections::hash_map::Entry::*;
//     let ent
//       = self.index.entry(e.from).or_default();
//     ent.entry(&e.via);
//     ()
//   }
// }
