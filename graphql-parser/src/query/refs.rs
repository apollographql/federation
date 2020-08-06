use crate::common::{Directive, Txt, Value};
use crate::query::{Field, Node, Visitor};
use crate::visit_each;
use crate::{query, Pos};

#[derive(Debug, Clone, PartialEq)]
pub enum SelectionRef<'a> {
    Ref(&'a query::Selection<'a>),
    Field(&'a Field<'a>),
    FieldRef(FieldRef<'a>),
    InlineFragmentRef(InlineFragmentRef<'a>),
}

#[derive(Debug, Clone, PartialEq)]
pub struct SelectionSetRef<'a> {
    pub span: (Pos, Pos),
    pub items: Vec<SelectionRef<'a>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FieldRef<'a> {
    pub position: Pos,
    pub alias: Option<Txt<'a>>,
    pub name: Txt<'a>,
    pub arguments: Vec<(Txt<'a>, Value<'a>)>,
    pub directives: Vec<Directive<'a>>,
    pub selection_set: SelectionSetRef<'a>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct InlineFragmentRef<'a> {
    pub position: Pos,
    pub type_condition: Option<Txt<'a>>,
    pub directives: Vec<Directive<'a>>,
    pub selection_set: SelectionSetRef<'a>,
}

impl<'a> Node for SelectionSetRef<'a> {
    fn accept<V: Visitor>(&self, visitor: &mut V) {
        visitor.enter_sel_set_ref(self);
        visit_each!(visitor: self.items);
        visitor.leave_sel_set_ref(self);
    }
}

impl<'a> Node for SelectionRef<'a> {
    fn accept<V: Visitor>(&self, visitor: &mut V) {
        visitor.enter_sel_ref(self);
        {
            use SelectionRef::*;
            match self {
                Ref(sel) => visitor.enter_sel(sel),
                Field(field) => field.selection_set.accept(visitor),
                FieldRef(field_ref) => field_ref.selection_set.accept(visitor),
                InlineFragmentRef(ifr) => ifr.selection_set.accept(visitor),
            }
        }
        visitor.leave_sel_ref(self);
    }
}
