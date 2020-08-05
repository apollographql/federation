use crate::common::Type;

pub trait Name<'a> {
    fn name(&self) -> Option<&'a str> {
        None
    }
}

impl<'a> Name<'a> for Type<'a> {
    fn name(&self) -> Option<&'a str> {
        match self {
            Type::NamedType(t) => Some(*t),
            Type::ListType(t) => t.name(),
            Type::NonNullType(t) => t.name(),
        }
    }
}
