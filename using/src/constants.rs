use graphql_parser::Pos;
use lazy_static::lazy_static;

use crate::{
    version::Version,
    request::Request,
    spec::Spec,
};

pub const USING_SPEC_URL: &str = "https://specs.apollo.dev/using";
pub const USING_VERSIONS: &[Version] = &[
    Version(0, 1),
];

lazy_static! {
    pub static ref USING_DEFAULT: Request = Request {
        spec: Spec {
            identity: USING_SPEC_URL.to_owned(),
            default_prefix: "using".to_owned(),
            version: USING_VERSIONS[0].clone(),
        },
        prefix: "using".to_owned(),
        position: Pos { line: 0, column: 0 },
    };
}