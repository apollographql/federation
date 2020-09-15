#[macro_export]
macro_rules! get_directive {
    ($directives:expr , $name:expr) => {
        $directives.iter().filter(|d| d.name == $name)
    };
    ($directives:expr , $name:literal , $arg:literal == $arg_val:expr) => {
        $directives.iter().filter(|d| d.name == $name).filter(|d| {
            d.arguments.iter().any(|(k, v)| {
                if let graphql_parser::query::Value::String(v) = v {
                    k == &$arg && v == $arg_val
                } else {
                    false
                }
            })
        })
    };
}

#[macro_export]
macro_rules! letp {
    ($pat:pat = $expr:expr => $stmt:stmt ) => {
        if let $pat = $expr {
            $stmt
        } else {
            unreachable!()
        }
    };
}

#[macro_export]
macro_rules! get_field_def {
    ($obj:ident, $name:expr) => {
        if $name == crate::consts::TYPENAME_FIELD_NAME {
            crate::consts::typename_field_def()
        } else {
            $obj.fields
                .iter()
                .find(|f| f.name == $name)
                .unwrap_or_else(|| panic!("Cannot query field `{}` on type `{}`", $name, $obj.name))
        }
    };
}

macro_rules! values {
    ($can_iter_tuples:expr) => {
        $can_iter_tuples.into_iter().map(|(_, v)| v).collect()
    };
    (iter $can_iter_tuples:expr) => {
        $can_iter_tuples.into_iter().map(|(_, v)| v)
    };
}

#[macro_export]
macro_rules! field_ref {
    ($f:expr, $ss:expr) => {
        graphql_parser::query::refs::FieldRef {
            position: $f.position,
            alias: $f.alias,
            name: $f.name,
            arguments: &$f.arguments,
            directives: &$f.directives,
            selection_set: $ss,
        }
    };
    ($f:expr) => {
        field_ref!(
            $f,
            graphql_parser::query::refs::SelectionSetRef::from(&$f.selection_set)
        )
    };
}

#[macro_export]
macro_rules! inline_fragment_ref {
    ($f:expr, $ss:expr) => {
        graphql_parser::query::refs::InlineFragmentRef {
            position: $f.position,
            type_condition: $f.type_condition,
            directives: &$f.directives,
            selection_set: $ss,
        }
    };
    ($f:expr) => {
        inline_fragment_ref!(
            $f,
            graphql_parser::query::refs::SelectionSetRef::from(&$f.selection_set)
        )
    };
}
