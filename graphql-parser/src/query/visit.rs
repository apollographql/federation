use super::{Definition, Document, Selection, SelectionSet};
use crate::visit_each;

#[allow(unused_variables)]
pub trait Visitor {
    fn enter_query<'a>(&mut self, doc: &Document<'a>) {}
    fn leave_query<'a>(&mut self, doc: &Document<'a>) {}
    fn enter_query_def<'a>(&mut self, def: &Definition<'a>) {}
    fn leave_query_def<'a>(&mut self, def: &Definition<'a>) {}
    fn enter_sel_set<'a>(&mut self, sel_set: &SelectionSet<'a>) {}
    fn leave_sel_set<'a>(&mut self, sel_set: &SelectionSet<'a>) {}
    fn enter_sel<'a>(&mut self, sel: &Selection<'a>) {}    
    fn leave_sel<'a>(&mut self, sel: &Selection<'a>) {}
}
pub trait Node {
    fn accept<V: Visitor>(&self, visitor: &mut V);
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
            FragmentSpread(_) => {},
            InlineFragment(inline) => inline.selection_set.accept(visitor),
        }
        visitor.leave_sel(self);
    }
}

#[test]
fn visits_a_query() -> Result<(), super::ParseError> {
    let query = super::parse_query(r###"
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
    "###)?;

    struct Print {
        output: Vec<String>
    };

    macro_rules! print {
        ($action:ident $Type:ident) => {
            fn $action<'a>(&mut self, node: &$Type<'a>) {
                self.output.push(format!("{} ({:?})", stringify!($action), node.name()));
            }
        }
    }
    
    use crate::Name;
    impl Visitor for Print {
        print!(enter_query Document);
        print!(leave_query Document);
        print!(enter_query_def Definition);
        print!(leave_query_def Definition);
        print!(enter_sel_set SelectionSet);
        print!(leave_sel_set SelectionSet);
        print!(enter_sel Selection);
        print!(leave_sel Selection);
    }

    let mut print = Print { output: vec![] };
    query.accept(&mut print);

    assert_eq!(print.output, vec![
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
    ]);

    Ok(())
}