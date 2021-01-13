use graphql_parser::{
    schema::{Directive, Value}
};

use crate::spec::{
    Spec,
    ParseError,
};

#[derive(Debug, Clone, PartialEq)]
pub struct Request {
    pub spec: Spec,
    pub prefix: String,
}

impl Request {
    pub fn from_directive(dir: &Directive) -> Option<Result<Request, ParseError>> {
        let mut spec: Option<Result<Spec, ParseError>> = None;
        let mut prefix: Option<String> = None;
        for (arg, val) in &dir.arguments {
            if *arg == "spec" {
                if let Value::String(url) = val {
                    spec = Some(Spec::parse(url));
                }
            }
            if *arg == "prefix" {
                if let Value::String(prefix_str) = val {
                    prefix = Some(prefix_str.to_owned())
                }
            }
        }

        spec.map(|result|
            result.map(|spec|
                Request {
                    prefix: prefix.unwrap_or_else(|| spec.default_prefix.clone()),
                    spec,    
                }
            )
        )
    }
}
