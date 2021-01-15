//! Constants, mainly supported versions of the `using` spec which we can
//! reference during bootstrapping.

use graphql_parser::Pos;
use lazy_static::lazy_static;

use crate::{request::Request, spec::Spec, version::Version};

/// The well-known URL for the `using` spec
pub const USING_SPEC_URL: &str = "https://specs.apollo.dev/using";

/// Versions of the `using` spec supported by this crate
pub const USING_VERSIONS: &[Version] = &[Version(0, 1)];

lazy_static! {
    /// A [`Request`](Request.html) for the default version of the `using` spec.
    /// This is the request we will treat as occurring if no explicit reference
    /// to the `using` spec is provided in the schema document.
    pub static ref USING_DEFAULT: Request = Request {
        spec: Spec {
            identity: USING_SPEC_URL.to_owned(),
            default_prefix: "using".to_owned(),
            version: USING_VERSIONS[0],
        },
        prefix: "using".to_owned(),
        position: Pos { line: 0, column: 0 },
    };
}
