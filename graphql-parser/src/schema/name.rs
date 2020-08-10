use super::*;
use crate::Name;

impl<'a> Name<'a> for Document<'a> {}

impl<'a> Name<'a> for Definition<'a> {
    fn name(&self) -> Option<&'a str> {
        match self {
            Definition::Schema(_) => None,
            Definition::Type(t) => t.name(),
            Definition::TypeExtension(te) => te.name(),
            Definition::Directive(d) => Some(d.name),
            Definition::Operation(o) => o.name,
            Definition::Fragment(f) => Some(f.name),
        }
    }
}

impl<'a> Name<'a> for TypeDefinition<'a> {
    fn name(&self) -> Option<&'a str> {
        match self {
            TypeDefinition::Scalar(s) => Some(s.name),
            TypeDefinition::Object(o) => Some(o.name),
            TypeDefinition::Interface(i) => Some(i.name),
            TypeDefinition::Union(u) => Some(u.name),
            TypeDefinition::Enum(e) => Some(e.name),
            TypeDefinition::InputObject(io) => Some(io.name),
        }
    }
}

impl<'a> Name<'a> for TypeExtension<'a> {
    fn name(&self) -> Option<&'a str> {
        match self {
            TypeExtension::Scalar(s) => Some(s.name),
            TypeExtension::Object(o) => Some(o.name),
            TypeExtension::Interface(i) => Some(i.name),
            TypeExtension::Union(u) => Some(u.name),
            TypeExtension::Enum(e) => Some(e.name),
            TypeExtension::InputObject(io) => Some(io.name),
        }
    }
}

impl<'a> Name<'a> for Field<'a> {
    fn name(&self) -> Option<&'a str> {
        Some(self.name)
    }
}

impl<'a> Name<'a> for InputValue<'a> {
    fn name(&self) -> Option<&'a str> {
        Some(self.name)
    }
}

impl<'a> Name<'a> for EnumValue<'a> {
    fn name(&self) -> Option<&'a str> {
        Some(self.name)
    }
}
