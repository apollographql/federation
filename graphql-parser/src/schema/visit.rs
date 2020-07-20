use super::*;
use crate::query;
use crate::query::Node as QueryNode;
use crate::{visit, visit_each};

#[allow(unused_variables)]
pub trait Visitor<'q>: query::Visitor<'q> {
    fn enter_schema<'a>(&'a mut self, doc: &'q Document<'q>)
    where
        'q: 'a,
    {
    }
    fn enter_schema_def<'a>(&'a mut self, def: &'q Definition<'q>)
    where
        'q: 'a,
    {
    }
    fn enter_field<'a>(&'a mut self, field: &'q Field<'q>)
    where
        'q: 'a,
    {
    }
    fn leave_field<'a>(&'a mut self, field: &'q Field<'q>)
    where
        'q: 'a,
    {
    }
    fn enter_input_value<'a>(&'a mut self, input_value: &'q InputValue<'q>)
    where
        'q: 'a,
    {
    }
    fn leave_input_value<'a>(&'a mut self, input_value: &'q InputValue<'q>)
    where
        'q: 'a,
    {
    }
    fn leave_schema_def<'a>(&'a mut self, def: &'q Definition<'q>)
    where
        'q: 'a,
    {
    }
    fn leave_schema<'a>(&'a mut self, doc: &'q Document<'q>)
    where
        'q: 'a,
    {
    }
}

pub trait Map: query::Map {
    fn schema<'a>(&mut self, doc: &Document<'a>, stack: &[Self::Output]) -> Self::Output;
    fn schema_def<'a>(&mut self, def: &Definition<'a>, stack: &[Self::Output]) -> Self::Output;
    fn field<'a>(&mut self, field: &Field<'a>, stack: &[Self::Output]) -> Self::Output;
    fn input_value<'a>(
        &mut self,
        input_value: &InputValue<'a>,
        stack: &[Self::Output],
    ) -> Self::Output;
}

impl<'q, M: Map> Visitor<'q> for visit::Fold<M> {
    fn enter_schema<'a>(&'a mut self, doc: &'q Document<'q>)
    where
        'q: 'a,
    {
        self.stack.push(self.map.schema(doc, &self.stack));
    }

    fn enter_schema_def<'a>(&'a mut self, def: &'q Definition<'q>)
    where
        'q: 'a,
    {
        self.stack.push(self.map.schema_def(def, &self.stack));
    }

    fn enter_field<'a>(&'a mut self, field: &'q Field<'q>)
    where
        'q: 'a,
    {
        self.stack.push(self.map.field(field, &self.stack));
    }

    fn leave_field<'a>(&'a mut self, _field: &'q Field<'q>)
    where
        'q: 'a,
    {
        self.pop();
    }

    fn enter_input_value<'a>(&'a mut self, input_value: &'q InputValue<'q>)
    where
        'q: 'a,
    {
        self.stack
            .push(self.map.input_value(input_value, &self.stack));
    }

    fn leave_input_value<'a>(&'a mut self, _input_value: &'q InputValue<'q>)
    where
        'q: 'a,
    {
        self.pop();
    }

    fn leave_schema_def<'a>(&'a mut self, _def: &'q Definition<'q>)
    where
        'q: 'a,
    {
        self.pop();
    }

    fn leave_schema<'a>(&'a mut self, _doc: &'q Document<'q>)
    where
        'q: 'a,
    {
        self.pop();
    }
}

pub trait Node<'q> {
    fn accept<'a, V: Visitor<'q>>(&'q self, visitor: &'a mut V)
    where
        'q: 'a;

    fn map<'a, M: Map>(&'q self, map: M) -> visit::Fold<M>
    where
        'q: 'a,
    {
        let mut mapping = visit::Fold {
            stack: vec![],
            map,
            output: None,
        };
        self.accept(&mut mapping);
        mapping
    }
}

impl<'q> Node<'q> for Document<'q> {
    fn accept<'a, V: Visitor<'q>>(&'q self, visitor: &'a mut V)
    where
        'q: 'a,
    {
        visitor.enter_schema(self);
        visit_each!(visitor: self.definitions);
        visitor.leave_schema(self);
    }
}

impl<'q> Node<'q> for Definition<'q> {
    fn accept<'a, V: Visitor<'q>>(&'q self, visitor: &'a mut V)
    where
        'q: 'a,
    {
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

impl<'q> Node<'q> for TypeDefinition<'q> {
    fn accept<'a, V: Visitor<'q>>(&'q self, visitor: &'a mut V)
    where
        'q: 'a,
    {
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

impl<'q> Node<'q> for TypeExtension<'q> {
    fn accept<'a, V: Visitor<'q>>(&'q self, visitor: &'a mut V)
    where
        'q: 'a,
    {
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

impl<'q> Node<'q> for Field<'q> {
    fn accept<'a, V: Visitor<'q>>(&'q self, visitor: &'a mut V)
    where
        'q: 'a,
    {
        visitor.enter_field(self);
        visitor.leave_field(self);
    }
}

impl<'q> Node<'q> for InputValue<'q> {
    fn accept<'a, V: Visitor<'q>>(&'q self, visitor: &'a mut V)
    where
        'q: 'a,
    {
        visitor.enter_input_value(self);
        visitor.leave_input_value(self);
    }
}
