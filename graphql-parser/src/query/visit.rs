use super::{Definition, Document, Selection, SelectionSet};
use crate::query::refs::{SelectionRef, SelectionSetRef};
use crate::{visit, visit_each};

// TODO(ran) FIXME: consider separating the visitor to RefVisitor
#[allow(unused_variables)]
pub trait Visitor {
    fn enter_query(&mut self, doc: &Document) {}
    fn enter_query_def(&mut self, def: &Definition) {}
    fn enter_sel_set(&mut self, sel_set: &SelectionSet) {}
    fn enter_sel_set_ref(&mut self, sel_set: &SelectionSetRef) {}
    fn enter_sel(&mut self, sel: &Selection) {}
    fn enter_sel_ref(&mut self, sel: &SelectionRef) {}
    fn leave_sel(&mut self, sel: &Selection) {}
    fn leave_sel_ref(&mut self, sel: &SelectionRef) {}
    fn leave_sel_set(&mut self, sel_set: &SelectionSet) {}
    fn leave_sel_set_ref(&mut self, sel_set: &SelectionSetRef) {}
    fn leave_query_def(&mut self, def: &Definition) {}
    fn leave_query(&mut self, doc: &Document) {}
}

pub trait Map: visit::Map {
    fn query(&mut self, doc: &Document, stack: &[Self::Output]) -> Self::Output;
    fn query_def(&mut self, def: &Definition, stack: &[Self::Output]) -> Self::Output;
    fn sel_set(&mut self, sel_set: &SelectionSet, stack: &[Self::Output]) -> Self::Output;
    fn sel_set_ref(&mut self, sel_set: &SelectionSetRef, stack: &[Self::Output]) -> Self::Output;
    fn sel(&mut self, sel: &Selection, stack: &[Self::Output]) -> Self::Output;
    fn sel_ref(&mut self, sel: &SelectionRef, stack: &[Self::Output]) -> Self::Output;
}

impl<M: Map> Visitor for visit::Fold<M> {
    fn enter_query(&mut self, doc: &Document) {
        self.stack.push(self.map.query(doc, &self.stack));
    }
    fn enter_query_def(&mut self, def: &Definition) {
        self.stack.push(self.map.query_def(def, &self.stack));
    }
    fn enter_sel_set(&mut self, sel_set: &SelectionSet) {
        self.stack.push(self.map.sel_set(sel_set, &self.stack));
    }

    fn enter_sel_set_ref(&mut self, sel_set: &SelectionSetRef) {
        self.stack.push(self.map.sel_set_ref(sel_set, &self.stack));
    }

    fn enter_sel(&mut self, sel: &Selection) {
        self.stack.push(self.map.sel(&sel, &self.stack));
    }

    fn enter_sel_ref(&mut self, sel: &SelectionRef) {
        self.stack.push(self.map.sel_ref(&sel, &self.stack));
    }

    fn leave_sel(&mut self, _sel: &Selection) {
        self.pop();
    }

    fn leave_sel_ref(&mut self, _sel: &SelectionRef) {
        self.pop();
    }

    fn leave_sel_set(&mut self, _sel_set: &SelectionSet) {
        self.pop();
    }

    fn leave_sel_set_ref(&mut self, _sel_set: &SelectionSetRef) {
        self.pop();
    }

    fn leave_query_def(&mut self, _def: &Definition) {
        self.pop();
    }
    fn leave_query(&mut self, _doc: &Document) {
        self.pop();
    }
}

pub trait Node {
    fn accept<V: Visitor>(&self, visitor: &mut V);
    fn map<M: Map>(&self, map: M) -> visit::Fold<M> {
        let mut mapping = visit::Fold {
            stack: vec![],
            map,
            output: None,
        };
        self.accept(&mut mapping);
        mapping
    }
}

impl<'a> Node for Document<'a> {
    fn accept<V: Visitor>(&self, visitor: &mut V) {
        visitor.enter_query(self);
        visit_each!(visitor: self.definitions);
        visitor.leave_query(self);
    }
}

impl<'a> Node for Definition<'a> {
    fn accept<V: Visitor>(&self, visitor: &mut V) {
        visitor.enter_query_def(self);
        use Definition::*;
        match self {
            SelectionSet(sel_set) => sel_set.accept(visitor),
            Operation(op) => op.selection_set.accept(visitor),
            Fragment(frag) => frag.selection_set.accept(visitor),
        }
        visitor.leave_query_def(self);
    }
}

impl<'a> Node for SelectionSet<'a> {
    fn accept<V: Visitor>(&self, visitor: &mut V) {
        visitor.enter_sel_set(self);
        visit_each!(visitor: self.items);
        visitor.leave_sel_set(self);
    }
}

impl<'a> Node for Selection<'a> {
    fn accept<V: Visitor>(&self, visitor: &mut V) {
        visitor.enter_sel(self);
        use Selection::*;
        match self {
            Field(field) => field.selection_set.accept(visitor),
            FragmentSpread(_) => {}
            InlineFragment(inline) => inline.selection_set.accept(visitor),
        }
        visitor.leave_sel(self);
    }
}

#[cfg(test)]
mod tests {
    use crate::query::refs::{SelectionRef, SelectionSetRef};
    use crate::{parse_query, query, query::*, visit, ParseError};

    #[test]
    fn visits_a_query() -> Result<(), ParseError> {
        let query = parse_query(
            r###"
        query SomeQuery {
            fieldA
            fieldB(arg: "hello", arg2: 48) {
                innerFieldOne
                innerFieldTwo
                ...fragmentSpread
                ...on SomeType {
                    someTypeField
                }            
            }
        }
        "###,
        )?;

        struct Print {
            output: Vec<String>,
        };

        macro_rules! print {
            ($action:ident $Type:ident) => {
                fn $action<'a>(&mut self, node: &$Type<'a>) {
                    self.output
                        .push(format!("{} ({:?})", stringify!($action), node.name()));
                }
            };
        }

        use crate::Name;
        impl query::Visitor for Print {
            print!(enter_query Document);
            print!(enter_query_def Definition);
            print!(enter_sel_set SelectionSet);
            print!(enter_sel Selection);
            print!(leave_sel_set SelectionSet);
            print!(leave_sel Selection);
            print!(leave_query_def Definition);
            print!(leave_query Document);
        }

        let mut print = Print { output: vec![] };
        query.accept(&mut print);

        assert_eq!(
            print.output,
            vec![
                r#"enter_query (None)"#,
                r#"enter_query_def (Some("SomeQuery"))"#,
                r#"enter_sel_set (None)"#,
                r#"enter_sel (Some("fieldA"))"#,
                r#"enter_sel_set (None)"#,
                r#"leave_sel_set (None)"#,
                r#"leave_sel (Some("fieldA"))"#,
                r#"enter_sel (Some("fieldB"))"#,
                r#"enter_sel_set (None)"#,
                r#"enter_sel (Some("innerFieldOne"))"#,
                r#"enter_sel_set (None)"#,
                r#"leave_sel_set (None)"#,
                r#"leave_sel (Some("innerFieldOne"))"#,
                r#"enter_sel (Some("innerFieldTwo"))"#,
                r#"enter_sel_set (None)"#,
                r#"leave_sel_set (None)"#,
                r#"leave_sel (Some("innerFieldTwo"))"#,
                r#"enter_sel (Some("fragmentSpread"))"#,
                r#"leave_sel (Some("fragmentSpread"))"#,
                r#"enter_sel (Some("SomeType"))"#,
                r#"enter_sel_set (None)"#,
                r#"enter_sel (Some("someTypeField"))"#,
                r#"enter_sel_set (None)"#,
                r#"leave_sel_set (None)"#,
                r#"leave_sel (Some("someTypeField"))"#,
                r#"leave_sel_set (None)"#,
                r#"leave_sel (Some("SomeType"))"#,
                r#"leave_sel_set (None)"#,
                r#"leave_sel (Some("fieldB"))"#,
                r#"leave_sel_set (None)"#,
                r#"leave_query_def (Some("SomeQuery"))"#,
                r#"leave_query (None)"#
            ]
        );

        Ok(())
    }

    #[test]
    fn maps_a_query() -> Result<(), crate::ParseError> {
        let query = crate::parse_query(
            r#"
            query {
                someField
                another { ...withFragment @directive }
            }
        "#,
        )?;
        struct TestMap {}
        impl visit::Map for TestMap {
            type Output = String;
            fn merge(&mut self, parent: String, child: String) -> String {
                format!("{}\n{}", parent, child)
            }
        }
        impl Map for TestMap {
            fn query<'a>(&mut self, _: &Document<'a>, stack: &[Self::Output]) -> Self::Output {
                format!("{}query", "    ".repeat(stack.len()))
            }
            fn query_def<'a>(
                &mut self,
                _: &Definition<'a>,
                stack: &[Self::Output],
            ) -> Self::Output {
                format!("{}query_def", "    ".repeat(stack.len()))
            }
            fn sel_set<'a>(
                &mut self,
                _: &SelectionSet<'a>,
                stack: &[Self::Output],
            ) -> Self::Output {
                format!("{}sel_set", "    ".repeat(stack.len()))
            }
            fn sel_set_ref(
                &mut self,
                _sel_set: &SelectionSetRef,
                _stack: &[Self::Output],
            ) -> Self::Output {
                unreachable!()
            }

            fn sel<'a>(&mut self, _: &Selection<'a>, stack: &[Self::Output]) -> Self::Output {
                format!("{}sel", "    ".repeat(stack.len()))
            }

            fn sel_ref(&mut self, _sel: &SelectionRef, _stack: &[Self::Output]) -> Self::Output {
                unreachable!()
            }
        }

        let tx = query.map(TestMap {});
        pretty_assertions::assert_eq!(
            tx.output,
            Some(String::from(
                r#"query
    query_def
        sel_set
            sel
                sel_set
            sel
                sel_set
                    sel"#
            ))
        );
        Ok(())
    }
}
