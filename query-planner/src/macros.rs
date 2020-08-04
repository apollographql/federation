// TODO(ran) FIXME: add docstring
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

// TODO(ran) FIXME: add docstring, maybe rename?
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
