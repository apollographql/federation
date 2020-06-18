use super::{Definition, Document, Selection, SelectionSet};
#[allow(unused_variables)]
trait QueryVisitor {
    fn enter_doc<'a>(&mut self, doc: &Document<'a>) {}
    fn leave_doc<'a>(&mut self, doc: &Document<'a>) {}
    fn enter_def<'a>(&mut self, def: &Definition<'a>) {}
    fn leave_def<'a>(&mut self, def: &Definition<'a>) {}
    fn enter_sel_set<'a>(&mut self, sel_set: &SelectionSet<'a>) {}
    fn leave_sel_set<'a>(&mut self, sel_set: &SelectionSet<'a>) {}
    fn enter_sel<'a>(&mut self, sel: &Selection<'a>) {}    
    fn leave_sel<'a>(&mut self, sel: &Selection<'a>) {}
}

trait QueryNode {
    fn accept<V: QueryVisitor>(&self, visitor: &mut V);
}

macro_rules! visit {
    ($visitor:ident : $vec:expr) => (
        for item in $vec.iter() {
            item.accept($visitor);
        }
    )
}

impl<'a> QueryNode for Document<'a> {
    fn accept<V: QueryVisitor>(&self, visitor: &mut V) {
        visitor.enter_doc(self);
        visit!(visitor: self.definitions);
        visitor.leave_doc(self);
    }
}

impl<'a> QueryNode for Definition<'a> {
    fn accept<V: QueryVisitor>(&self, visitor: &mut V) {
        visitor.enter_def(self);
        use Definition::*;
        match self {
            SelectionSet(sel_set) => sel_set.accept(visitor),
            Operation(op) => op.selection_set.accept(visitor),
            Fragment(frag) => frag.selection_set.accept(visitor),
        }
        visitor.leave_def(self);
    }
}

impl<'a> QueryNode for SelectionSet<'a> {
    fn accept<V: QueryVisitor>(&self, visitor: &mut V) {
        visitor.enter_sel_set(self);
        visit!(visitor: self.items);
        visitor.leave_sel_set(self);
    }
}

impl<'a> QueryNode for Selection<'a> {
    fn accept<V: QueryVisitor>(&self, visitor: &mut V) {
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
        output: String
    };

    macro_rules! print {
        ($action:ident $Type:ident) => {
            fn $action<'a>(&mut self, node: &$Type<'a>) {
                self.output.push_str(format!("\n        {} ({:?})", stringify!($action), node.name()).as_str());
            }
        }
    }
    
    use crate::Name;
    impl QueryVisitor for Print {
        print!(enter_doc Document);
        print!(leave_doc Document);
        print!(enter_def Definition);
        print!(leave_def Definition);
        print!(enter_sel_set SelectionSet);
        print!(leave_sel_set SelectionSet);
        print!(enter_sel Selection);
        print!(leave_sel Selection);
    }

    let mut print = Print { output: String::from("") };
    query.accept(&mut print);

    assert_eq!(print.output, r#"
        enter_doc (None)
        enter_def (Some("SomeQuery"))
        enter_sel_set (None)
        enter_sel (Some("fieldA"))
        enter_sel_set (None)
        leave_sel_set (None)
        leave_sel (Some("fieldA"))
        enter_sel (Some("fieldB"))
        enter_sel_set (None)
        enter_sel (Some("innerFieldOne"))
        enter_sel_set (None)
        leave_sel_set (None)
        leave_sel (Some("innerFieldOne"))
        enter_sel (Some("innerFieldTwo"))
        enter_sel_set (None)
        leave_sel_set (None)
        leave_sel (Some("innerFieldTwo"))
        enter_sel (Some("fragmentSpread"))
        leave_sel (Some("fragmentSpread"))
        enter_sel (Some("SomeType"))
        enter_sel_set (None)
        enter_sel (Some("someTypeField"))
        enter_sel_set (None)
        leave_sel_set (None)
        leave_sel (Some("someTypeField"))
        leave_sel_set (None)
        leave_sel (Some("SomeType"))
        leave_sel_set (None)
        leave_sel (Some("fieldB"))
        leave_sel_set (None)
        leave_def (Some("SomeQuery"))
        leave_doc (None)"#);

    Ok(())
}