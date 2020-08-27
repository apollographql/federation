use crate::query::refs::*;
use crate::query::*;

pub struct MinifiedFormatter {
    buf: String,
}

impl MinifiedFormatter {
    pub fn write(&mut self, str: &str) {
        self.buf.push_str(str)
    }
}

impl Default for MinifiedFormatter {
    fn default() -> Self {
        Self {
            buf: String::with_capacity(1024),
        }
    }
}

trait MinifiedString {
    /// writes the minified string representation of this type, returns true if whitespace is needed after it.
    fn minified(&self, f: &mut MinifiedFormatter) -> bool;
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
                t.minified($f);
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
                $f.buf.push(' ');
            }
            space = t.minified($f);
        }
    };
}

macro_rules! minify_enum {
    ($t:path, $($p:path),+) => {
        impl MinifiedString for $t {
            fn minified(&self, f: &mut MinifiedFormatter) -> bool {
                match self {
                    $( $p(v) => v.minified(f) ),*
                }
            }
        }
    };
}

macro_rules! write {
    ($f:ident, $($e:expr,)*) => {
        $( if $e.len() == 1 { $f.buf.push($e.chars().next().unwrap()) } else { $f.write($e) } );*
    };
    ($f:ident, $($e:expr),*) => {
        write!($f, $($e,)*)
    }
}

impl<'a> MinifiedString for Document<'a> {
    fn minified(&self, f: &mut MinifiedFormatter) -> bool {
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
    fn minified(&self, f: &mut MinifiedFormatter) -> bool {
        write!(f, "fragment ", self.name, " on ", self.type_condition);
        minify_each!(f, self.directives);
        self.selection_set.minified(f);

        self.selection_set.items.is_empty()
    }
}

impl<'a> MinifiedString for OperationDefinition<'a> {
    fn minified(&self, f: &mut MinifiedFormatter) -> bool {
        write!(f, self.kind.as_str());
        if let Some(name) = self.name {
            write!(f, " ", name);
        }
        minify_each!((f, self.variable_definitions) no_space);
        minify_each!(f, self.directives);
        self.selection_set.minified(f);

        self.selection_set.items.is_empty()
    }
}

impl<'a> MinifiedString for SelectionSet<'a> {
    fn minified(&self, f: &mut MinifiedFormatter) -> bool {
        minify_each!({f, self.items});
        false
    }
}

impl<'a> MinifiedString for SelectionSetRef<'a> {
    fn minified(&self, f: &mut MinifiedFormatter) -> bool {
        minify_each!({f, self.items});
        false
    }
}

impl<'a> MinifiedString for VariableDefinition<'a> {
    fn minified(&self, f: &mut MinifiedFormatter) -> bool {
        write!(f, "$", self.name, ":",);
        self.var_type.minified(f);
        if let Some(ref default) = self.default_value {
            write!(f, "=");
            default.minified(f);
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
    SelectionRef::InlineFragmentRef
);

impl<'a> MinifiedString for Field<'a> {
    fn minified(&self, f: &mut MinifiedFormatter) -> bool {
        if let Some(alias) = self.alias {
            write!(f, alias, ":");
        }
        write!(f, self.name);
        minify_each!((f, self.arguments));
        minify_each!(f, self.directives);
        self.selection_set.minified(f);

        self.selection_set.items.is_empty()
    }
}

impl<'a> MinifiedString for FieldRef<'a> {
    fn minified(&self, f: &mut MinifiedFormatter) -> bool {
        if let Some(alias) = self.alias {
            write!(f, alias, ":");
        }
        write!(f, self.name);
        minify_each!((f, self.arguments));
        minify_each!(f, self.directives);
        self.selection_set.minified(f);

        self.selection_set.items.is_empty()
    }
}

impl<'a> MinifiedString for FragmentSpread<'a> {
    fn minified(&self, f: &mut MinifiedFormatter) -> bool {
        write!(f, "...", self.fragment_name);
        minify_each!(f, self.directives);
        true
    }
}

impl<'a> MinifiedString for InlineFragment<'a> {
    fn minified(&self, f: &mut MinifiedFormatter) -> bool {
        write!(f, "...");
        if let Some(cond) = self.type_condition {
            write!(f, "on ", cond);
        }
        minify_each!(f, self.directives);
        self.selection_set.minified(f);

        self.selection_set.items.is_empty()
    }
}

impl<'a> MinifiedString for InlineFragmentRef<'a> {
    fn minified(&self, f: &mut MinifiedFormatter) -> bool {
        write!(f, "...");
        if let Some(cond) = self.type_condition {
            write!(f, "on ", cond);
        }
        minify_each!(f, self.directives);
        self.selection_set.minified(f);

        self.selection_set.items.is_empty()
    }
}

impl<'a> MinifiedString for Directive<'a> {
    fn minified(&self, f: &mut MinifiedFormatter) -> bool {
        write!(f, "@", self.name);
        minify_each!((f, self.arguments));
        true
    }
}

impl<'a> MinifiedString for Value<'a> {
    fn minified(&self, f: &mut MinifiedFormatter) -> bool {
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
    fn minified(&self, f: &mut MinifiedFormatter) -> bool {
        let (a, b) = self;
        write!(f, a, ":");
        b.minified(f);
        true
    }
}

impl<'a> MinifiedString for (&Txt<'a>, &Value<'a>) {
    fn minified(&self, f: &mut MinifiedFormatter) -> bool {
        let (a, b) = self;
        write!(f, a, ":");
        b.minified(f);
        true
    }
}

impl<'a> MinifiedString for Type<'a> {
    fn minified(&self, f: &mut MinifiedFormatter) -> bool {
        match self {
            Type::NamedType(name) => {
                write!(f, name);
                true
            }
            Type::ListType(typ) => {
                write!(f, "[");
                typ.minified(f);
                write!(f, "]");
                false
            }
            Type::NonNullType(typ) => {
                typ.minified(f);
                write!(f, "!");
                false
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::parse_query;
    use crate::query::minified::{MinifiedFormatter, MinifiedString};

    #[test]
    fn minified() {
        let queries: Vec<&str> = vec![
            "{a{b}c}",
            "query{testing}",
            "{body{__typename nested{__typename}}test{__typename nested{__typename}}}",
            "query($representations:[_Any!]!){_entities(representations:$representations){...on Book{__typename isbn title year}}}",
            "{body{__typename ...on Image{attributes{url}}...on Text{attributes{bold text}}}}",
            "query($arg:String$arg2:Int){field(argValue:$arg){otherField field3(foo:$arg2)}}",
            "query($representations:[_Any!]!){_entities(representations:$representations){...on User{reviews{body}numberOfReviews}}}",
            "query($representations:[_Any!]!$format:Boolean){_entities(representations:$representations){...on User{reviews{body(format:$format)}}}}"
        ];
        for query in queries {
            let parsed = parse_query(query).unwrap();
            let mut f = MinifiedFormatter::default();
            parsed.minified(&mut f);
            assert_eq!(query, f.buf);
        }
    }
}
