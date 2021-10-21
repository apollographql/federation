//! This file includes types used to convert JSON from the function in do_compose.js
//! into strongly typed Rust data structures.

use serde::{Deserialize, Serialize};

use std::error::Error;
use std::fmt::{self, Display};

/// CompositionOutput contains information about the supergraph that was composed.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CompositionOutput {
    /// Supergraph SDL can be used to start a gateway instance
    pub supergraph_sdl: String,
}

/// An error which occurred during JavaScript composition.
///
/// The shape of this error is meant to mimic that of the error created within
/// JavaScript, which is a [`GraphQLError`] from the [`graphql-js`] library.
///
/// [`graphql-js']: https://npm.im/graphql
/// [`GraphQLError`]: https://github.com/graphql/graphql-js/blob/3869211/src/error/GraphQLError.js#L18-L75
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub(crate) struct CompositionError {
    /// A human-readable description of the error that prevented composition.
    message: Option<String>,

    #[serde(flatten)]
    /// [`JsCompositionErrorExtensions`]
    extensions: Option<JsCompositionErrorExtensions>,
}

impl CompositionError {
    #[cfg(test)]
    pub(crate) fn new(code: String, message: Option<String>) -> CompositionError {
        CompositionError {
            extensions: Some(JsCompositionErrorExtensions { code }),
            message,
        }
    }
}

impl Display for CompositionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let code = if let Some(extensions) = &self.extensions {
            &extensions.code
        } else {
            "UNKNOWN"
        };
        if let Some(message) = &self.message {
            write!(f, "{}: {}", code, &message)
        } else {
            write!(f, "{}", code)
        }
    }
}

impl Error for CompositionError {}

/// Mimicking the JavaScript-world from which this error comes, this represents
/// the `extensions` property of a JavaScript [`GraphQLError`] from the
/// [`graphql-js`] library. Such errors are created when errors have prevented
/// successful composition, which is accomplished using [`errorWithCode`]. An
/// [example] of this can be seen within the `federation-js` JavaScript library.
///
/// [`graphql-js']: https://npm.im/graphql
/// [`GraphQLError`]: https://github.com/graphql/graphql-js/blob/3869211/src/error/GraphQLError.js#L18-L75
/// [`errorWithCode`]: https://github.com/apollographql/federation/blob/d7ca0bc2/federation-js/src/composition/utils.ts#L200-L216
/// [example]: https://github.com/apollographql/federation/blob/d7ca0bc2/federation-js/src/composition/validate/postComposition/executableDirectivesInAllServices.ts#L47-L53
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub(crate) struct JsCompositionErrorExtensions {
    /// An Apollo Federation composition error code.
    ///
    /// A non-exhaustive list of error codes that this includes, is:
    ///
    ///   - EXTERNAL_TYPE_MISMATCH
    ///   - EXTERNAL_UNUSED
    ///   - KEY_FIELDS_MISSING_ON_BASE
    ///   - KEY_MISSING_ON_BASE
    ///   - KEY_NOT_SPECIFIED
    ///   - PROVIDES_FIELDS_MISSING_EXTERNAL
    ///
    /// ...and many more!  See the `federation-js` composition library for
    /// more details (and search for `errorWithCode`).
    code: String,
}

/// The `SubgraphDefinition` represents everything we need to know about a
/// service (subgraph) for its GraphQL runtime responsibilities. It is not
/// at all different from the notion of [`ServiceDefinition` in TypeScript]
/// used in Apollo Gateway's operation.
///
/// This struct has nothing to do with the configuration file itself.
///
/// Since we'll be running this within a JavaScript environment these properties
/// will be serialized into camelCase, to match the JavaScript expectations.
///
/// [`ServiceDefinition` in TypeScript]: https://github.com/apollographql/federation/blob/d2e34909/federation-js/src/composition/types.ts#L49-L53
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubgraphDefinition {
    /// The name of the service (subgraph).  We use this name internally to
    /// in the representation of the composed schema and for designations
    /// within the human-readable QueryPlan.
    pub name: String,
    /// The routing/runtime URL where the subgraph can be found that will
    /// be able to fulfill the requests it is responsible for.
    pub url: String,
    /// The Schema Definition Language (SDL)
    pub sdl: String,
}

impl SubgraphDefinition {
    /// Create a new [`SubgraphDefinition`]
    pub fn new<N: Into<String>, U: Into<String>, S: Into<String>>(
        name: N,
        url: U,
        sdl: S,
    ) -> SubgraphDefinition {
        SubgraphDefinition {
            name: name.into(),
            url: url.into(),
            sdl: sdl.into(),
        }
    }
}
