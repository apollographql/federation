use std::fmt;

use crate::format::{format_directives, Displayable, Formatter, Style};

use crate::schema::ast::*;

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

fn description(description: &Option<String>, f: &mut Formatter) {
    if let Some(ref descr) = *description {
        f.indent();
        f.write_quoted(descr.as_ref());
        f.endline();
    }
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
            Definition::Schema(ref s) => {
                f.margin();
                s.display(f)
            }
            Definition::Type(ref t) => {
                f.margin();
                t.display(f)
            }
            Definition::TypeExtension(ref e) => {
                f.margin();
                e.display(f)
            }
            Definition::Directive(ref d) => {
                f.margin();
                d.display(f)
            }
            Definition::Operation(ref o) => o.display(f),
            Definition::Fragment(ref g) => g.display(f),
        }
    }
}

impl<'a> Displayable for SchemaDefinition<'a> {
    fn display(&self, f: &mut Formatter) {
        f.indent();
        f.write("schema");
        format_directives(&self.directives, f);
        f.write(" ");
        f.start_block();
        if let Some(ref q) = self.query {
            f.indent();
            f.write("query: ");
            f.write(q.as_ref());
            f.endline();
        }
        if let Some(ref m) = self.mutation {
            f.indent();
            f.write("mutation: ");
            f.write(m.as_ref());
            f.endline();
        }
        if let Some(ref s) = self.subscription {
            f.indent();
            f.write("subscription: ");
            f.write(s.as_ref());
            f.endline();
        }
        f.end_block();
    }
}

impl<'a> Displayable for TypeDefinition<'a> {
    fn display(&self, f: &mut Formatter) {
        match *self {
            TypeDefinition::Scalar(ref s) => s.display(f),
            TypeDefinition::Object(ref o) => o.display(f),
            TypeDefinition::Interface(ref i) => i.display(f),
            TypeDefinition::Union(ref u) => u.display(f),
            TypeDefinition::Enum(ref e) => e.display(f),
            TypeDefinition::InputObject(ref i) => i.display(f),
        }
    }
}

impl<'a> Displayable for ScalarType<'a> {
    fn display(&self, f: &mut Formatter) {
        description(&self.description, f);
        f.indent();
        f.write("scalar ");
        f.write(self.name.as_ref());
        format_directives(&self.directives, f);
        f.endline();
    }
}

impl<'a> Displayable for ScalarTypeExtension<'a> {
    fn display(&self, f: &mut Formatter) {
        f.indent();
        f.write("extend scalar ");
        f.write(self.name.as_ref());
        format_directives(&self.directives, f);
        f.endline();
    }
}

fn format_fields<'a>(fields: &[Field<'a>], f: &mut Formatter) {
    if !fields.is_empty() {
        f.write(" ");
        f.start_block();
        for fld in fields {
            fld.display(f);
        }
        f.end_block();
    } else {
        f.endline();
    }
}

impl<'a> Displayable for ObjectType<'a> {
    fn display(&self, f: &mut Formatter) {
        description(&self.description, f);
        f.indent();
        f.write("type ");
        f.write(self.name.as_ref());
        format_interfaces(&self.implements_interfaces, f);
        format_directives(&self.directives, f);
        format_fields(&self.fields, f);
    }
}

fn format_interfaces<'a>(implements_interfaces: &[Txt<'a>], f: &mut Formatter) {
    if !implements_interfaces.is_empty() {
        f.write(" implements ");
        f.write(implements_interfaces[0].as_ref());
        for name in &implements_interfaces[1..] {
            f.write(" & ");
            f.write(name.as_ref());
        }
    }
}

impl<'a> Displayable for ObjectTypeExtension<'a> {
    fn display(&self, f: &mut Formatter) {
        f.indent();
        f.write("extend type ");
        f.write(self.name.as_ref());
        format_interfaces(&self.implements_interfaces, f);
        format_directives(&self.directives, f);
        format_fields(&self.fields, f);
    }
}

impl<'a> Displayable for InputValue<'a> {
    fn display(&self, f: &mut Formatter) {
        if let Some(ref descr) = self.description {
            f.write_quoted(descr.as_ref());
            f.write(" ");
        }
        f.write(self.name.as_ref());
        f.write(": ");
        self.value_type.display(f);
        if let Some(ref def) = self.default_value {
            f.write(" = ");
            def.display(f);
        }
        format_directives(&self.directives, f);
    }
}

fn format_arguments<'a>(arguments: &[InputValue<'a>], f: &mut Formatter) {
    if !arguments.is_empty() {
        f.write("(");
        arguments[0].display(f);
        for arg in &arguments[1..] {
            f.write(", ");
            arg.display(f);
        }
        f.write(")");
    }
}

impl<'a> Displayable for Field<'a> {
    fn display(&self, f: &mut Formatter) {
        description(&self.description, f);
        f.indent();
        f.write(self.name.as_ref());
        format_arguments(&self.arguments, f);
        f.write(": ");
        self.field_type.display(f);
        format_directives(&self.directives, f);
        f.endline();
    }
}

impl<'a> Displayable for InterfaceType<'a> {
    fn display(&self, f: &mut Formatter) {
        description(&self.description, f);
        f.indent();
        f.write("interface ");
        f.write(self.name.as_ref());
        format_interfaces(&self.implements_interfaces, f);
        format_directives(&self.directives, f);
        format_fields(&self.fields, f);
    }
}

impl<'a> Displayable for InterfaceTypeExtension<'a> {
    fn display(&self, f: &mut Formatter) {
        f.indent();
        f.write("extend interface ");
        f.write(self.name.as_ref());
        format_directives(&self.directives, f);
        format_fields(&self.fields, f);
    }
}

impl<'a> Displayable for UnionType<'a> {
    fn display(&self, f: &mut Formatter) {
        description(&self.description, f);
        f.indent();
        f.write("union ");
        f.write(self.name.as_ref());
        format_directives(&self.directives, f);
        if !self.types.is_empty() {
            f.write(" = ");
            f.write(self.types[0].as_ref());
            for typ in &self.types[1..] {
                f.write(" | ");
                f.write(typ.as_ref());
            }
        }
        f.endline();
    }
}

impl<'a> Displayable for UnionTypeExtension<'a> {
    fn display(&self, f: &mut Formatter) {
        f.indent();
        f.write("extend union ");
        f.write(self.name.as_ref());
        format_directives(&self.directives, f);
        if !self.types.is_empty() {
            f.write(" = ");
            f.write(self.types[0].as_ref());
            for typ in &self.types[1..] {
                f.write(" | ");
                f.write(typ.as_ref());
            }
        }
        f.endline();
    }
}

impl<'a> Displayable for EnumType<'a> {
    fn display(&self, f: &mut Formatter) {
        description(&self.description, f);
        f.indent();
        f.write("enum ");
        f.write(self.name.as_ref());
        format_directives(&self.directives, f);
        if !self.values.is_empty() {
            f.write(" ");
            f.start_block();
            for val in &self.values {
                f.indent();
                if let Some(ref descr) = val.description {
                    f.write_quoted(descr.as_ref());
                    f.write(" ");
                }
                f.write(val.name.as_ref());
                format_directives(&val.directives, f);
                f.endline();
            }
            f.end_block();
        } else {
            f.endline();
        }
    }
}

impl<'a> Displayable for EnumTypeExtension<'a> {
    fn display(&self, f: &mut Formatter) {
        f.indent();
        f.write("extend enum ");
        f.write(self.name.as_ref());
        format_directives(&self.directives, f);
        if !self.values.is_empty() {
            f.write(" ");
            f.start_block();
            for val in &self.values {
                f.indent();
                if let Some(ref descr) = val.description {
                    f.write_quoted(descr.as_ref());
                    f.write(" ");
                }
                f.write(val.name.as_ref());
                format_directives(&val.directives, f);
                f.endline();
            }
            f.end_block();
        } else {
            f.endline();
        }
    }
}

fn format_inputs<'a>(fields: &[InputValue<'a>], f: &mut Formatter) {
    if !fields.is_empty() {
        f.write(" ");
        f.start_block();
        for fld in fields {
            f.indent();
            fld.display(f);
            f.endline();
        }
        f.end_block();
    } else {
        f.endline();
    }
}

impl<'a> Displayable for InputObjectType<'a> {
    fn display(&self, f: &mut Formatter) {
        description(&self.description, f);
        f.indent();
        f.write("input ");
        f.write(self.name.as_ref());
        format_directives(&self.directives, f);
        format_inputs(&self.fields, f);
    }
}

impl<'a> Displayable for InputObjectTypeExtension<'a> {
    fn display(&self, f: &mut Formatter) {
        f.indent();
        f.write("extend input ");
        f.write(self.name.as_ref());
        format_directives(&self.directives, f);
        format_inputs(&self.fields, f);
    }
}

impl<'a> Displayable for TypeExtension<'a> {
    fn display(&self, f: &mut Formatter) {
        match *self {
            TypeExtension::Scalar(ref s) => s.display(f),
            TypeExtension::Object(ref o) => o.display(f),
            TypeExtension::Interface(ref i) => i.display(f),
            TypeExtension::Union(ref u) => u.display(f),
            TypeExtension::Enum(ref e) => e.display(f),
            TypeExtension::InputObject(ref i) => i.display(f),
        }
    }
}

impl<'a> Displayable for DirectiveDefinition<'a> {
    fn display(&self, f: &mut Formatter) {
        description(&self.description, f);
        f.indent();
        f.write("directive @");
        f.write(self.name.as_ref());
        format_arguments(&self.arguments, f);
        if !self.locations.is_empty() {
            f.write(" on ");
            let mut first = true;
            for loc in &self.locations {
                if first {
                    first = false;
                } else {
                    f.write(" | ");
                }
                f.write(loc.as_str());
            }
        }
        f.endline();
    }
}

impl_display!(
    'a
    Document,
    Definition,
    SchemaDefinition,
    TypeDefinition,
    TypeExtension,
    ScalarType,
    ScalarTypeExtension,
    ObjectType,
    ObjectTypeExtension,
    Field,
    InputValue,
    InterfaceType,
    InterfaceTypeExtension,
    UnionType,
    UnionTypeExtension,
    EnumType,
    EnumTypeExtension,
    InputObjectType,
    InputObjectTypeExtension,
    DirectiveDefinition,
);
