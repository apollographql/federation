use crate::{visit, visit_each};

use super::{Definition, Document, Selection, SelectionSet};

#[allow(unused_variables)]
pub trait Visitor<'q> {
    fn enter_query<'a>(&'a mut self, doc: &'q Document<'q>)
    where
        'q: 'a,
    {
    }
    fn enter_query_def<'a>(&'a mut self, def: &'q Definition<'q>)
    where
        'q: 'a,
    {
    }
    fn enter_sel_set<'a>(&'a mut self, sel_set: &'q SelectionSet<'q>)
    where
        'q: 'a,
    {
    }
    fn enter_sel<'a>(&'a mut self, sel: &'q Selection<'q>)
    where
        'q: 'a,
    {
    }
    fn leave_sel<'a>(&'a mut self, sel: &'q Selection<'q>)
    where
        'q: 'a,
    {
    }
    fn leave_sel_set<'a>(&'a mut self, sel_set: &'q SelectionSet<'q>)
    where
        'q: 'a,
    {
    }
    fn leave_query_def<'a>(&'a mut self, def: &'q Definition<'q>)
    where
        'q: 'a,
    {
    }
    fn leave_query<'a>(&'a mut self, doc: &'q Document<'q>)
    where
        'q: 'a,
    {
    }
}

pub trait Map: visit::Map {
    fn query(&mut self, doc: &Document, stack: &[Self::Output]) -> Self::Output;
    fn query_def(&mut self, def: &Definition, stack: &[Self::Output]) -> Self::Output;
    fn sel_set(&mut self, sel_set: &SelectionSet, stack: &[Self::Output]) -> Self::Output;
    fn sel(&mut self, sel: &Selection, stack: &[Self::Output]) -> Self::Output;
}

impl<'q, M: Map> Visitor<'q> for visit::Fold<M> {
    fn enter_query<'a>(&'a mut self, doc: &'q Document<'q>)
    where
        'q: 'a,
    {
        self.stack.push(self.map.query(doc, &self.stack));
    }

    fn enter_query_def<'a>(&'a mut self, def: &'q Definition<'q>)
    where
        'q: 'a,
    {
        self.stack.push(self.map.query_def(def, &self.stack));
    }

    fn enter_sel_set<'a>(&'a mut self, sel_set: &'q SelectionSet<'q>)
    where
        'q: 'a,
    {
        self.stack.push(self.map.sel_set(sel_set, &self.stack));
    }

    fn enter_sel<'a>(&'a mut self, sel: &'q Selection<'q>)
    where
        'q: 'a,
    {
        self.stack.push(self.map.sel(&sel, &self.stack));
    }

    fn leave_sel<'a>(&'a mut self, _sel: &'q Selection<'q>)
    where
        'q: 'a,
    {
        self.pop();
    }

    fn leave_sel_set<'a>(&'a mut self, _sel_set: &'q SelectionSet<'q>)
    where
        'q: 'a,
    {
        self.pop();
    }

    fn leave_query_def<'a>(&'a mut self, _def: &'q Definition<'q>)
    where
        'q: 'a,
    {
        self.pop();
    }

    fn leave_query<'a>(&'a mut self, _doc: &'q Document<'q>)
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
        visitor.enter_query(self);
        visit_each!(visitor: self.definitions);
        visitor.leave_query(self);
    }
}

impl<'q> Node<'q> for Definition<'q> {
    fn accept<'a, V: Visitor<'q>>(&'q self, visitor: &'a mut V)
    where
        'q: 'a,
    {
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

impl<'q> Node<'q> for SelectionSet<'q> {
    fn accept<'a, V: Visitor<'q>>(&'q self, visitor: &'a mut V)
    where
        'q: 'a,
    {
        visitor.enter_sel_set(self);
        visit_each!(visitor: self.items);
        visitor.leave_sel_set(self);
    }
}

impl<'q> Node<'q> for Selection<'q> {
    fn accept<'a, V: Visitor<'q>>(&'q self, visitor: &'a mut V)
    where
        'q: 'a,
    {
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
    use crate::schema;
    use crate::{parse_query, parse_schema, query, query::*, visit, ParseError};

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
                fn $action<'a>(&'a mut self, node: &'q $Type<'q>)
                where
                    'q: 'a,
                {
                    self.output
                        .push(format!("{} ({:?})", stringify!($action), node.name()));
                }
            };
        }

        use crate::Name;
        impl<'q> query::Visitor<'q> for Print {
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
            fn sel<'a>(&mut self, _: &Selection<'a>, stack: &[Self::Output]) -> Self::Output {
                format!("{}sel", "    ".repeat(stack.len()))
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

    #[test]
    fn visitor_with_lifetimes() {
        pub struct QueryPlanContext<'q> {
            pub fragments: Vec<&'q query::FragmentDefinition<'q>>,
        }

        pub struct QueryPlanVisitor<'q, 's> {
            pub schema: &'q schema::Document<'s>,
            pub context: Option<QueryPlanContext<'q>>,
        }

        impl<'q, 's: 'q> Visitor<'q> for QueryPlanVisitor<'q, 's> {
            fn enter_query<'a>(&'a mut self, doc: &'q Document<'q>)
            where
                'q: 'a,
            {
                let fragments: Vec<&'q query::FragmentDefinition<'q>> = doc
                    .definitions
                    .iter()
                    .flat_map(|d| match d {
                        query::Definition::Fragment(frag) => Some(frag),
                        _ => None,
                    })
                    .collect();

                let context = QueryPlanContext { fragments };
                self.context = Some(context);
            }
        }

        let schema = "schema { query: Query } type Query { i: Int, j: Int }";
        let schema = parse_schema(schema).unwrap();
        let query = "query { ...ij } fragment ij on Query { i j }";
        let query = parse_query(query).unwrap();
        let mut visitor = QueryPlanVisitor {
            schema: &schema,
            context: None,
        };
        query.accept(&mut visitor);
        if let Some(context) = visitor.context {
            assert_eq!(context.fragments.len(), 1);
        } else {
            panic!("context should be Some");
        }
    }
}
