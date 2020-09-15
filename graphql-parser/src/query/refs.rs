use crate::common::{Directive, Txt, Value};
use crate::query::Node as QueryNode;
use crate::query::{Field, SelectionSet};
use crate::{node_trait, visit, visit_each};
use crate::{query, Pos};

#[derive(Debug, Clone, PartialEq, Hash)]
pub enum SelectionRef<'a> {
    Ref(&'a query::Selection<'a>),
    Field(&'a Field<'a>),
    FieldRef(FieldRef<'a>),
    InlineFragmentRef(InlineFragmentRef<'a>),
    // only used with auto fragmentation at before writing the "operation" field into a FetchNode.
    FragmentSpreadRef(FragmentSpreadRef),
}

impl<'a> SelectionRef<'a> {
    pub fn is_field(&self) -> bool {
        match self {
            SelectionRef::Ref(query::Selection::Field(_)) => true,
            SelectionRef::Field(_) => true,
            SelectionRef::FieldRef(_) => true,
            _ => false,
        }
    }

    pub fn is_aliased_field(&self) -> bool {
        if !self.is_field() {
            false
        } else {
            match self {
                SelectionRef::Ref(query::Selection::Field(query::Field { alias, .. })) => {
                    alias.is_some()
                }
                SelectionRef::Field(query::Field { alias, .. }) => alias.is_some(),
                SelectionRef::FieldRef(FieldRef { alias, .. }) => alias.is_some(),
                _ => unreachable!(),
            }
        }
    }

    pub fn into_fields_selection_set(self) -> Option<SelectionSetRef<'a>> {
        match self {
            SelectionRef::FieldRef(f) => Some(f.selection_set),
            SelectionRef::Ref(query::Selection::Field(f)) | SelectionRef::Field(f) => {
                Some(SelectionSetRef {
                    span: (Pos { line: 0, column: 0 }, Pos { line: 0, column: 0 }),
                    items: f
                        .selection_set
                        .items
                        .iter()
                        .map(SelectionRef::Ref)
                        .collect(),
                })
            }
            _ => None,
        }
    }

    pub fn no_or_empty_selection_set(&self) -> bool {
        match self {
            SelectionRef::Ref(query::Selection::Field(f)) => f.selection_set.items.is_empty(),
            SelectionRef::Field(f) => f.selection_set.items.is_empty(),
            SelectionRef::FieldRef(fr) => fr.selection_set.items.is_empty(),
            _ => true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Hash)]
pub struct FragmentSpreadRef {
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Default, Hash)]
pub struct SelectionSetRef<'a> {
    pub span: (Pos, Pos),
    pub items: Vec<SelectionRef<'a>>,
}

impl<'a> From<&'a SelectionSet<'a>> for SelectionSetRef<'a> {
    fn from(ss: &'a SelectionSet<'a>) -> Self {
        SelectionSetRef {
            span: ss.span,
            items: ss.items.iter().map(SelectionRef::Ref).collect(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Hash)]
pub struct FieldRef<'a> {
    pub position: Pos,
    pub alias: Option<Txt<'a>>,
    pub name: Txt<'a>,
    pub arguments: &'a Vec<(Txt<'a>, Value<'a>)>,
    pub directives: &'a Vec<Directive<'a>>,
    pub selection_set: SelectionSetRef<'a>,
}

impl<'a> FieldRef<'a> {
    pub fn response_name(&self) -> Txt<'a> {
        self.alias.unwrap_or(self.name)
    }
}

#[derive(Debug, Clone, PartialEq, Hash)]
pub struct InlineFragmentRef<'a> {
    pub position: Pos,
    pub type_condition: Option<Txt<'a>>,
    pub directives: &'a Vec<Directive<'a>>,
    pub selection_set: SelectionSetRef<'a>,
}

// only used with auto fragmentation at before writing the "operation" field into a FetchNode.
#[derive(Debug, Clone, PartialEq)]
pub struct FragmentDefinitionRef<'a> {
    pub name: String,
    pub type_condition: String,
    pub selection_set: SelectionSetRef<'a>,
}

node_trait!(Visitor, Map);

impl<'a> Node for SelectionSetRef<'a> {
    fn accept<V: Visitor>(&self, visitor: &mut V) {
        visitor.enter_sel_set_ref(self);
        visit_each!(visitor: self.items);
        visitor.leave_sel_set_ref(self);
    }
}

impl<'a> Node for SelectionRef<'a> {
    fn accept<V: Visitor>(&self, visitor: &mut V) {
        if let SelectionRef::Ref(sel) = self {
            sel.accept(visitor)
        } else {
            visitor.enter_sel_ref(self);
            {
                use SelectionRef::*;
                match self {
                    Field(field) => field.selection_set.accept(visitor),
                    FieldRef(field_ref) => field_ref.selection_set.accept(visitor),
                    InlineFragmentRef(ifr) => ifr.selection_set.accept(visitor),
                    _ => unreachable!(),
                }
            }
            visitor.leave_sel_ref(self);
        }
    }
}

#[allow(unused_variables)]
pub trait Visitor: query::Visitor {
    fn enter_sel_set_ref(&mut self, sel_set: &SelectionSetRef) {}
    fn enter_sel_ref(&mut self, sel: &SelectionRef) {}
    fn leave_sel_ref(&mut self, sel: &SelectionRef) {}
    fn leave_sel_set_ref(&mut self, sel_set: &SelectionSetRef) {}
}

pub trait Map: query::Map {
    fn sel_set_ref(&mut self, sel_set: &SelectionSetRef, stack: &[Self::Output]) -> Self::Output;
    fn sel_ref(&mut self, sel: &SelectionRef, stack: &[Self::Output]) -> Self::Output;
}

impl<M: Map> Visitor for visit::Fold<M> {
    fn enter_sel_set_ref(&mut self, sel_set: &SelectionSetRef) {
        self.stack.push(self.map.sel_set_ref(sel_set, &self.stack));
    }

    fn enter_sel_ref(&mut self, sel: &SelectionRef) {
        self.stack.push(self.map.sel_ref(&sel, &self.stack));
    }

    fn leave_sel_ref(&mut self, _sel: &SelectionRef) {
        self.pop();
    }

    fn leave_sel_set_ref(&mut self, _sel_set: &SelectionSetRef) {
        self.pop();
    }
}
