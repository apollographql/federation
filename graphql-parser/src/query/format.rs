use std::fmt;

use crate::format::{format_directives, Displayable, Formatter, Style};

use crate::query::ast::*;
use crate::query::refs::{FieldRef, InlineFragmentRef, SelectionRef, SelectionSetRef};

impl<'a> Document<'a> {
    /// Format a document according to style
    pub fn format(&self, style: &Style) -> String {
        let mut formatter = Formatter::new(style);
        self.display(&mut formatter);
        formatter.into_string()
    }
}

fn to_string<T: Displayable>(v: &T) -> String {
    let style = Style::default();
    let mut formatter = Formatter::new(&style);
    v.display(&mut formatter);
    formatter.into_string()
}

impl<'a> Displayable for Document<'a> {
    fn display(&self, f: &mut Formatter) {
        for item in &self.definitions {
            item.display(f);
        }
    }
}

impl<'a> Displayable for Definition<'a> {
    fn display(&self, f: &mut Formatter) {
        match *self {
            Definition::SelectionSet(ref s) => s.display(f),
            Definition::Operation(ref op) => op.display(f),
            Definition::Fragment(ref frag) => frag.display(f),
        }
    }
}

// TODO(trevor)
impl<'a> Displayable for FragmentDefinition<'a> {
    fn display(&self, f: &mut Formatter) {
        f.margin();
        f.indent();
        f.write("fragment ");
        f.write(self.name.as_ref());
        f.write(" on ");
        f.write(self.type_condition);
        format_directives(&self.directives, f);
        f.write(" ");
        f.start_block();
        for item in &self.selection_set.items {
            item.display(f);
        }
        f.end_block();
    }
}

impl<'a> Displayable for SelectionSet<'a> {
    #[inline]
    fn display(&self, f: &mut Formatter) {
        f.margin();
        f.indent();
        f.start_block();
        // for item in &self.items {
        //     item.display(f);
        //     if f.is_minified() {
        //         f.write(" ");
        //     } else {
        //         f.endline();
        //     }
        // }
        for (idx, item) in self.items.iter().enumerate() {
            item.display(f);

            match item {
                Selection::Field(field) => {
                    if !f.is_minified() {
                        f.endline();
                    } else if idx < self.items.len() - 1 {
                        if !field.selection_set.items.len() > 0 {
                            f.write(" ");
                        }
                    }
                },
                Selection::InlineFragment(_) => {
                    if !f.is_minified() {
                        f.endline();
                    }
                },
                Selection::FragmentSpread(_) => {
                    if !f.is_minified() {
                        f.endline();
                    } else if idx < self.items.len() - 1 {
                        f.write(" ");
                    }
                }
            }
        }
        f.end_block();
    }
}

impl<'a> Displayable for SelectionSetRef<'a> {
    #[inline]
    fn display(&self, f: &mut Formatter) {
        f.margin();
        f.indent();
        f.start_block();

        for (idx, item) in self.items.iter().enumerate() {
            item.display(f);

            match item {
                SelectionRef::Ref(_) => {
                    ()
                },
                SelectionRef::Field(field) => {
                    if !f.is_minified() {
                        f.endline();
                    } else if idx < self.items.len() - 1 {
                        if !field.selection_set.items.len() > 0 {
                            f.write(" ");
                        }
                    }
                },
                SelectionRef::FieldRef(fr) => {
                    if !f.is_minified() {
                        f.endline();
                    } else if idx < self.items.len() - 1 {
                        if !fr.selection_set.items.len() > 0 {
                            f.write(" ");
                        }
                    }
                },
                SelectionRef::InlineFragmentRef(_) => {
                    if !f.is_minified() {
                        f.endline();
                    }
                }
                //,
                // SelectionRef::FragmentSpreadRef(_) => {
                //     if !f.is_minified() {
                //         f.endline();
                //     } else if idx < self.items.len() - 1 {
                //         f.write(" ");
                //     }
                // }
            }
        }
        f.end_block();
    }
}

impl<'a> Displayable for Selection<'a> {
    fn display(&self, f: &mut Formatter) {
        match *self {
            Selection::Field(ref fld) => fld.display(f),
            Selection::InlineFragment(ref frag) => frag.display(f),
            Selection::FragmentSpread(ref frag) => frag.display(f),
        }
    }
}

impl<'a> Displayable for SelectionRef<'a> {
    fn display(&self, f: &mut Formatter) {
        use SelectionRef::*;
        match self {
            Ref(sel) => sel.display(f),
            Field(field) => field.display(f),
            FieldRef(field_ref) => field_ref.display(f),
            InlineFragmentRef(ifr) => ifr.display(f),
        }
    }
}

impl<'a> Displayable for FieldRef<'a> {
    // NB: This is cargo culted straight from Displayable for Field
    fn display(&self, f: &mut Formatter) {
        f.indent();
        if let Some(ref alias) = self.alias {
            f.write(alias.as_ref());
            f.write(": ");
        }
        f.write(self.name.as_ref());
        format_arguments(&self.arguments, f);
        format_directives(&self.directives, f);
        if !self.selection_set.items.is_empty() {
            f.write(" ");
            f.start_block();
            for item in &self.selection_set.items {
                item.display(f);
            }
            f.end_block();
        } else {
            f.endline();
        }
    }
}

impl<'a> Displayable for InlineFragmentRef<'a> {
    // NB: This is cargo culted straight from Displayable for InlineFragment
    fn display(&self, f: &mut Formatter) {
        f.indent();
        f.write("...");
        if let Some(ref cond) = self.type_condition {
            f.write(" on ");
            f.write(cond);
        }
        format_directives(&self.directives, f);
        f.write(" ");
        f.start_block();
        for item in &self.selection_set.items {
            item.display(f);
        }
        f.end_block();
    }
}

fn format_arguments<'a>(arguments: &[(Txt<'a>, Value<'a>)], f: &mut Formatter) {
    if !arguments.is_empty() {
        f.write("(");
        f.write(arguments[0].0.as_ref());
        f.write(": ");
        arguments[0].1.display(f);
        for arg in &arguments[1..] {
            f.write(", ");
            f.write(arg.0.as_ref());
            f.write(": ");
            arg.1.display(f);
        }
        f.write(")");
    }
}

impl<'a> Displayable for Field<'a> {
    fn display(&self, f: &mut Formatter) {
        f.indent();
        if let Some(ref alias) = self.alias {
            f.write(alias.as_ref());
            f.write(": ");
        }
        f.write(self.name.as_ref());
        format_arguments(&self.arguments, f);
        format_directives(&self.directives, f);
        if !self.selection_set.items.is_empty() {
            // minification: don't include the space before opening a selection set on a field
            if !f.is_minified() {
                f.write(" ");
            }

            // TODO(trevor): Is there a reason it was implemented this way!??!
            // f.start_block();
            // for item in &self.selection_set.items {
            //     item.display(f);
            // }
            // f.end_block();
            self.selection_set.display(f);

        }
        // else {
        //     if !f.is_minified() {
        //         f.endline();
        //     }
        // }
    }
}

impl<'a> Displayable for OperationDefinition<'a> {
    fn display(&self, f: &mut Formatter) {
        f.margin();
        f.indent();
        f.write(self.kind.as_str());
        if let Some(ref name) = self.name {
            f.write(" ");
            f.write(name.as_ref());
            if !self.variable_definitions.is_empty() {
                f.write("(");
                self.variable_definitions[0].display(f);
                for var in &self.variable_definitions[1..] {
                    f.write(", ");
                    var.display(f);
                }
                f.write(")");
            }
        }
        format_directives(&self.directives, f);
        f.write(" ");
        f.start_block();
        for item in &self.selection_set.items {
            item.display(f);
        }
        f.end_block();
    }
}

impl<'a> Displayable for VariableDefinition<'a> {
    fn display(&self, f: &mut Formatter) {
        f.write("$");
        f.write(self.name.as_ref());
        f.write(": ");
        self.var_type.display(f);
        if let Some(ref default) = self.default_value {
            f.write(" = ");
            default.display(f);
        }
    }
}

impl<'a> Displayable for Type<'a> {
    fn display(&self, f: &mut Formatter) {
        match *self {
            Type::NamedType(ref name) => f.write(name.as_ref()),
            Type::ListType(ref typ) => {
                f.write("[");
                typ.display(f);
                f.write("]");
            }
            Type::NonNullType(ref typ) => {
                typ.display(f);
                f.write("!");
            }
        }
    }
}

impl<'a> Displayable for Value<'a> {
    fn display(&self, f: &mut Formatter) {
        match *self {
            Value::Variable(ref name) => {
                f.write("$");
                f.write(name.as_ref());
            }
            Value::Int(ref num) => f.write(&format!("{}", num)),
            Value::Float(val) => f.write(&format!("{}", val)),
            Value::String(ref val) => f.write_quoted(val),
            Value::Boolean(true) => f.write("true"),
            Value::Boolean(false) => f.write("false"),
            Value::Null => f.write("null"),
            Value::Enum(ref name) => f.write(name.as_ref()),
            Value::List(ref items) => {
                f.write("[");
                if !items.is_empty() {
                    items[0].display(f);
                    for item in &items[1..] {
                        f.write(", ");
                        item.display(f);
                    }
                }
                f.write("]");
            }
            Value::Object(ref items) => {
                f.write("{");
                let mut first = true;
                for (name, value) in items.iter() {
                    if first {
                        first = false;
                    } else {
                        f.write(", ");
                    }
                    f.write(name.as_ref());
                    f.write(": ");
                    value.display(f);
                }
                f.write("}");
            }
        }
    }
}

impl<'a> Displayable for InlineFragment<'a> {
    fn display(&self, f: &mut Formatter) {
        f.indent();
        f.write("...");
        if let Some(ref cond) = self.type_condition {
            if !f.is_minified() {
                f.write(" on ");
            } else {
                f.write("on ");
            }
            f.write(cond);
        }
        format_directives(&self.directives, f);
        if !f.is_minified() {
            f.write(" ");
        }
        f.start_block();
        for item in &self.selection_set.items {
            item.display(f);
        }
        f.end_block();
    }
}

impl<'a> Displayable for FragmentSpread<'a> {
    fn display(&self, f: &mut Formatter) {
        f.indent();
        f.write("...");
        f.write(self.fragment_name.as_ref());
        format_directives(&self.directives, f);
        f.endline();
    }
}

impl<'a> Displayable for Directive<'a> {
    fn display(&self, f: &mut Formatter) {
        f.write("@");
        f.write(self.name.as_ref());
        format_arguments(self.arguments.as_slice(), f);
    }
}

impl_display!(
    'a
    Document,
    Definition,
    OperationDefinition,
    FragmentDefinition,
    SelectionSet,
    Field,
    VariableDefinition,
    Type,
    Value,
    InlineFragment,
    FragmentSpread,
    Directive,
    SelectionSetRef,
    SelectionRef,
    FieldRef,
    InlineFragmentRef,
);
