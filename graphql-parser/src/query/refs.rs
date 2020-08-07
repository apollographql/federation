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

impl<'a> FieldRef<'a> {
    pub fn from_field(f: &'a Field<'a>, selection_set: SelectionSetRef<'a>) -> FieldRef<'a> {
        FieldRef {
            position: Pos { line: 0, column: 0 },
            alias: f.alias,
            name: f.name,
            arguments: f.arguments.clone(),
            directives: f.directives.clone(),
            selection_set,
        }
    }

    pub fn response_name(&self) -> Txt<'a> {
        self.alias.unwrap_or(self.name)
    }

    pub fn clone_except_selection_set(
        f: &'a FieldRef<'a>,
        selection_set: SelectionSetRef<'a>,
    ) -> FieldRef<'a> {
        FieldRef {
            position: Pos { line: 0, column: 0 },
            alias: f.alias,
            name: f.name,
            arguments: f.arguments.clone(),
            directives: f.directives.clone(),
            selection_set,
        }
    }
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
