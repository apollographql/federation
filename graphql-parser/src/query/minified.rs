use crate::query::refs::*;
use crate::query::*;

#[derive(Debug)]
pub struct MinifiedFormatter {
    buf: String,
}

impl Default for MinifiedFormatter {
    fn default() -> Self {
        Self {
            buf: String::with_capacity(1024),
        }
    }
}

pub trait MinifiedString {
    /// writes the minified string representation of this type, returns true if whitespace is needed after it.
    fn minify(&self, f: &mut MinifiedFormatter) -> bool;
}

pub trait DisplayMinified {
    fn minified(&self) -> String;
}

impl<T: MinifiedString> DisplayMinified for T {
    fn minified(&self) -> String {
        let mut formatter = MinifiedFormatter::default();
        self.minify(&mut formatter);
        formatter.buf
    }
}

macro_rules! minify_each {
    ({$f:ident, $v:expr}) => {
        if !$v.is_empty() {
            write!($f, "{");
            minify_each!($f, $v);
            write!($f, "}");
        }
    };
    (($f:ident, $v:expr) no_space) => {
        if !$v.is_empty() {
            write!($f, "(");
            for t in $v.iter() {
                t.minify($f);
            }
            write!($f, ")");
        }
    };
    (($f:ident, $v:expr)) => {
        if !$v.is_empty() {
            write!($f, "(");
            minify_each!($f, $v);
            write!($f, ")");
        }
    };
    ($f:ident, $v:expr) => {
        let mut space = false;
        for t in $v.iter() {
            if space {
                write!($f, " ");
            }
            space = t.minify($f);
        }
    };
}

macro_rules! minify_enum {
    ($t:path, $($p:path),+) => {
        impl MinifiedString for $t {
            fn minify(&self, f: &mut MinifiedFormatter) -> bool {
                match self {
                    $( $p(v) => v.minify(f) ),*
                }
            }
        }
    };
}

macro_rules! write {
    ($f:ident, $($e:expr,)*) => {
        $( if $e.len() == 1 { $f.buf.push($e.chars().next().unwrap()) } else { $f.buf.push_str($e) } )*
    };
    ($f:ident, $($e:expr),*) => {
        write!($f, $($e,)*);
    };
}

impl<'a> MinifiedString for Document<'a> {
    fn minify(&self, f: &mut MinifiedFormatter) -> bool {
        minify_each!(f, self.definitions);
        false
    }
}

minify_enum!(
    Definition<'_>,
    Definition::SelectionSet,
    Definition::Operation,
    Definition::Fragment
);

impl<'a> MinifiedString for FragmentDefinition<'a> {
    fn minify(&self, f: &mut MinifiedFormatter) -> bool {
        write!(f, "fragment ", self.name, " on ", self.type_condition);
        minify_each!(f, self.directives);
        self.selection_set.minify(f);
        self.selection_set.items.is_empty()
    }
}

impl<'a> MinifiedString for FragmentDefinitionRef<'a> {
    fn minify(&self, f: &mut MinifiedFormatter) -> bool {
        write!(f, "fragment ", &self.name, " on ", &self.type_condition);
        self.selection_set.minify(f);
        self.selection_set.items.is_empty()
    }
}

impl<'a> MinifiedString for OperationDefinition<'a> {
    fn minify(&self, f: &mut MinifiedFormatter) -> bool {
        write!(f, self.kind.as_str());
        if let Some(name) = self.name {
            write!(f, " ", name);
        }
        minify_each!((f, self.variable_definitions) no_space);
        minify_each!(f, self.directives);
        self.selection_set.minify(f);

        self.selection_set.items.is_empty()
    }
}

impl<'a> MinifiedString for SelectionSet<'a> {
    fn minify(&self, f: &mut MinifiedFormatter) -> bool {
        minify_each!({f, self.items});
        false
    }
}

impl<'a> MinifiedString for SelectionSetRef<'a> {
    fn minify(&self, f: &mut MinifiedFormatter) -> bool {
        minify_each!({f, self.items});
        false
    }
}

impl<'a> MinifiedString for VariableDefinition<'a> {
    fn minify(&self, f: &mut MinifiedFormatter) -> bool {
        write!(f, "$", self.name, ":",);
        self.var_type.minify(f);
        if let Some(ref default) = self.default_value {
            write!(f, "=");
            default.minify(f);
        };
        true
    }
}

minify_enum!(
    Selection<'_>,
    Selection::Field,
    Selection::FragmentSpread,
    Selection::InlineFragment
);

minify_enum!(
    SelectionRef<'_>,
    SelectionRef::Ref,
    SelectionRef::Field,
    SelectionRef::FieldRef,
    SelectionRef::InlineFragmentRef,
    SelectionRef::FragmentSpreadRef
);

impl<'a> MinifiedString for FragmentSpreadRef {
    fn minify(&self, f: &mut MinifiedFormatter) -> bool {
        write!(f, "...", &self.name);
        true
    }
}

impl<'a> MinifiedString for Field<'a> {
    fn minify(&self, f: &mut MinifiedFormatter) -> bool {
        if let Some(alias) = self.alias {
            write!(f, alias, ":");
        }
        write!(f, self.name);
        minify_each!((f, self.arguments));
        minify_each!(f, self.directives);
        self.selection_set.minify(f);

        self.selection_set.items.is_empty()
    }
}

impl<'a> MinifiedString for FieldRef<'a> {
    fn minify(&self, f: &mut MinifiedFormatter) -> bool {
        if let Some(alias) = self.alias {
            write!(f, alias, ":");
        }
        write!(f, self.name);
        minify_each!((f, self.arguments));
        minify_each!(f, self.directives);
        self.selection_set.minify(f);

        self.selection_set.items.is_empty()
    }
}

impl<'a> MinifiedString for FragmentSpread<'a> {
    fn minify(&self, f: &mut MinifiedFormatter) -> bool {
        write!(f, "...", self.fragment_name);
        minify_each!(f, self.directives);
        true
    }
}

impl<'a> MinifiedString for InlineFragment<'a> {
    fn minify(&self, f: &mut MinifiedFormatter) -> bool {
        write!(f, "...");
        if let Some(cond) = self.type_condition {
            write!(f, "on ", cond);
        }
        minify_each!(f, self.directives);
        self.selection_set.minify(f);

        self.selection_set.items.is_empty()
    }
}

impl<'a> MinifiedString for InlineFragmentRef<'a> {
    fn minify(&self, f: &mut MinifiedFormatter) -> bool {
        write!(f, "...");
        if let Some(cond) = self.type_condition {
            write!(f, "on ", cond);
        }
        minify_each!(f, self.directives);
        self.selection_set.minify(f);

        self.selection_set.items.is_empty()
    }
}

impl<'a> MinifiedString for Directive<'a> {
    fn minify(&self, f: &mut MinifiedFormatter) -> bool {
        write!(f, "@", self.name);
        minify_each!((f, self.arguments));
        true
    }
}

impl<'a> MinifiedString for Value<'a> {
    fn minify(&self, f: &mut MinifiedFormatter) -> bool {
        match self {
            Value::Variable(name) => {
                write!(f, "$", name);
                true
            }
            Value::Int(ref num) => {
                write!(f, &format!("{}", num));
                true
            }
            Value::Float(val) => {
                write!(f, &format!("{}", val));
                true
            }
            Value::String(ref val) => {
                write!(f, "\"", val, "\"");
                true
            }
            Value::Boolean(true) => {
                write!(f, "true");
                true
            }
            Value::Boolean(false) => {
                write!(f, "false");
                true
            }
            Value::Null => {
                write!(f, "null");
                true
            }
            Value::Enum(name) => {
                write!(f, name);
                true
            }
            Value::List(ref items) => {
                write!(f, "[");
                minify_each!(f, items);
                write!(f, "]");
                false
            }
            Value::Object(items) => {
                write!(f, "{");
                minify_each!(f, items);
                write!(f, "}");
                false
            }
        }
    }
}

impl<'a> MinifiedString for (Txt<'a>, Value<'a>) {
    fn minify(&self, f: &mut MinifiedFormatter) -> bool {
        let (a, b) = self;
        write!(f, a, ":");
        b.minify(f);
        true
    }
}

impl<'a> MinifiedString for (&Txt<'a>, &Value<'a>) {
    fn minify(&self, f: &mut MinifiedFormatter) -> bool {
        let (a, b) = self;
        write!(f, a, ":");
        b.minify(f);
        true
    }
}

impl<'a> MinifiedString for Type<'a> {
    fn minify(&self, f: &mut MinifiedFormatter) -> bool {
        match self {
            Type::NamedType(name) => {
                write!(f, name);
                true
            }
            Type::ListType(typ) => {
                write!(f, "[");
                typ.minify(f);
                write!(f, "]");
                false
            }
            Type::NonNullType(typ) => {
                typ.minify(f);
                write!(f, "!");
                false
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::{parse_query, DisplayMinified};

    #[test]
    fn minify() {
        let queries: Vec<&str> = vec![
            "{a{b}c}",
            "query{testing}",
            "{body{__typename nested{__typename}}test{__typename nested{__typename}}}",
            "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{__typename isbn title year}}}",
            "{body{__typename ...on Image{attributes{url}}...on Text{attributes{bold text}}}}",
            "query($arg:String$arg2:Int){field(argValue:$arg){otherField field3(foo:$arg2)}}",
            "query($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{body}numberOfReviews}}}",
            "query($representations:[_Any!]!$format:Boolean){_entities(representations:$representations){...on User{reviews{body(format:$format)}}}}",
            "query($arg1:String$representations:[_Any!]!){_entities(arg:$arg1 representations:$representations){...on User{reviews{body}numberOfReviews}}}",
        ];
        for query in queries {
            let parsed = parse_query(query).unwrap();
            assert_eq!(query, parsed.minified())
        }
    }
}
