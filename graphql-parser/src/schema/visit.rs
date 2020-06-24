use super::*;
use crate::query;
use crate::query::Node as QueryNode;
use crate::{visit, visit_each};

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
pub trait Fold: query::Fold {
    fn schema<'a>(&mut self, doc: &Document<'a>, stack: &[Self::Output]) -> Self::Output;
    fn schema_def<'a>(&mut self, def: &Definition<'a>, stack: &[Self::Output]) -> Self::Output;
    fn field<'a>(&mut self, field: &Field<'a>, stack: &[Self::Output]) -> Self::Output;
    fn input_value<'a>(
        &mut self,
        input_value: &InputValue<'a>,
        stack: &[Self::Output],
    ) -> Self::Output;
}

impl<F: Fold> Visitor for visit::Folding<F> {
    fn enter_schema<'a>(&mut self, doc: &Document<'a>) {
        self.stack.push(self.fold.schema(doc, &self.stack));
    }
    fn enter_schema_def<'a>(&mut self, def: &Definition<'a>) {
        self.stack.push(self.fold.schema_def(def, &self.stack));
    }
    fn enter_field<'a>(&mut self, field: &Field<'a>) {
        self.stack.push(self.fold.field(field, &self.stack));
    }
    fn leave_field<'a>(&mut self, _: &Field<'a>) {
        self.pop();
    }
    fn enter_input_value<'a>(&mut self, input_value: &InputValue<'a>) {
        self.stack
            .push(self.fold.input_value(input_value, &self.stack));
    }
    fn leave_input_value<'a>(&mut self, _: &InputValue<'a>) {
        self.pop();
    }
    fn leave_schema_def<'a>(&mut self, _: &Definition<'a>) {
        self.pop();
    }
    fn leave_schema<'a>(&mut self, _: &Document<'a>) {
        self.pop();
    }
}

#[allow(unused_variables)]
pub trait Node {
    fn accept<V: Visitor>(&self, visitor: &mut V);
    fn fold<F: Fold>(&self, fold: F) -> visit::Folding<F> {
        let mut folding = visit::Folding::new(fold);
        self.accept(&mut folding);
        folding
    }
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
            Definition::Schema(_) => {}
            Definition::Type(t) => t.accept(visitor),
            Definition::TypeExtension(tx) => tx.accept(visitor),
            Definition::Directive(_) => {}
            Definition::Operation(o) => o.selection_set.accept(visitor),
            Definition::Fragment(f) => f.selection_set.accept(visitor),
        }
        visitor.leave_schema_def(self);
    }
}

impl<'a> Node for TypeDefinition<'a> {
    fn accept<V: Visitor>(&self, visitor: &mut V) {
        match self {
            TypeDefinition::Scalar(_) => {}
            TypeDefinition::Object(o) => visit_each!(visitor: o.fields),
            TypeDefinition::Interface(i) => visit_each!(visitor: i.fields),
            TypeDefinition::Union(_) => {}
            TypeDefinition::Enum(_) => {}
            TypeDefinition::InputObject(io) => visit_each!(visitor: io.fields),
        }
    }
}

impl<'a> Node for TypeExtension<'a> {
    fn accept<V: Visitor>(&self, visitor: &mut V) {
        match self {
            TypeExtension::Scalar(_) => {}
            TypeExtension::Object(o) => visit_each!(visitor: o.fields),
            TypeExtension::Interface(i) => visit_each!(visitor: i.fields),
            TypeExtension::Union(_) => {}
            TypeExtension::Enum(_) => {}
            TypeExtension::InputObject(io) => visit_each!(visitor: io.fields),
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
