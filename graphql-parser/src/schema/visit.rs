use super::*;
use crate::visit_each;
use crate::query;
use crate::query::{Node as QueryNode};

#[allow(unused_variables)]
pub trait Visitor: query::Visitor {
  fn enter_schema<'a>(&mut self, doc: &Document<'a>) {}
  fn enter_schema_def<'a>(&mut self, def: &Definition<'a>) {}
  fn enter_field<'a>(&mut self, field: &Field<'a>) {}
  fn leave_field<'a>(&mut self, field: &Field<'a>) {}
  fn enter_input_value<'a>(&mut self, input_value: &InputValue<'a>) {}
  fn leave_input_value<'a>(&mut self, input_value: &InputValue<'a>) {}
  fn leave_schema_def<'a>(&mut self, def: &Definition<'a>) {}
  fn leave_schema<'a>(&mut self, doc: &Document<'a>) {}  
}

#[allow(unused_variables)]
pub trait Node {
  fn accept<V: Visitor>(&self, visitor: &mut V) {}
}

impl<'a> Node for Document<'a> {
    fn accept<V: Visitor>(&self, visitor: &mut V) {
        visitor.enter_schema(self);
        visit_each!(visitor: self.definitions);
        visitor.leave_schema(self);
    }

}

impl<'a> Node for Definition<'a> {
  fn accept<V: Visitor>(&self, visitor: &mut V) {
      visitor.enter_schema_def(self);
      match self {
          Definition::Schema(_) => {},
          Definition::Type(t) => t.accept(visitor),
          Definition::TypeExtension(tx) => tx.accept(visitor),
          Definition::Directive(_) => {}
          Definition::Operation(o) =>
            o.selection_set.accept(visitor),
          Definition::Fragment(f) =>
            f.selection_set.accept(visitor),
      }
      visitor.leave_schema_def(self);
  }
}

impl<'a> Node for TypeDefinition<'a> {
  fn accept<V: Visitor>(&self, visitor: &mut V) {
      match self {
          TypeDefinition::Scalar(_) => {}
          TypeDefinition::Object(o) =>
            visit_each!(visitor: o.fields),
          TypeDefinition::Interface(i) =>
            visit_each!(visitor: i.fields),
          TypeDefinition::Union(_) => {}
          TypeDefinition::Enum(_) => {}
          TypeDefinition::InputObject(io) =>
            visit_each!(visitor: io.fields),
      }
  }
}

impl<'a> Node for TypeExtension<'a> {
  fn accept<V: Visitor>(&self, visitor: &mut V) {
      match self {
          TypeExtension::Scalar(_) => {}
          TypeExtension::Object(o) =>
            visit_each!(visitor: o.fields),
          TypeExtension::Interface(i) =>
            visit_each!(visitor: i.fields),
          TypeExtension::Union(_) => {}
          TypeExtension::Enum(_) => {}
          TypeExtension::InputObject(io) =>
            visit_each!(visitor: io.fields),
      }
  }
}

impl<'a> Node for Field<'a> {
  fn accept<V: Visitor>(&self, visitor: &mut V) {
      visitor.enter_field(self);
      visitor.leave_field(self);
  }
}

impl<'a> Node for InputValue<'a> {
  fn accept<V: Visitor>(&self, visitor: &mut V) {
      visitor.enter_input_value(self);
      visitor.leave_input_value(self);
  }
}
