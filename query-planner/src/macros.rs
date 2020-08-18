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
                .unwrap_or_else(|| panic!("Cannot query field {} on type {}", $name, $obj.name))
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
