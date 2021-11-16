//! This file includes types used to convert JSON from the function in do_compose.js
//! into strongly typed Rust data structures.

use serde::{Deserialize, Serialize};

use std::error::Error;
use std::fmt::{self, Display};

use apollo_federation_types::BuildError;

/// CompositionOutput contains information about the supergraph that was composed.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CompositionOutput {
    /// Supergraph SDL can be used to start a gateway instance
    pub supergraph_sdl: String,

    /// Hints contain information about the composition and should be displayed
    pub hints: Vec<String>,
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

impl From<CompositionError> for BuildError {
    fn from(input: CompositionError) -> Self {
        Self::composition_error(input.extensions.map(|x| x.code), input.message)
    }
}

impl Error for CompositionError {}

/// Mimicking the JavaScript-world from which this error comes, this represents
/// the `extensions` property of a JavaScript [`GraphQLError`] from the
/// [`graphql-js`] library. Such errors are created when errors have prevented
/// successful composition, which is accomplished using [`error`] from the `internals-js` module.
/// An [example] of this can be seen within the `composition-js` JavaScript library.
///
/// [`graphql-js']: https://npm.im/graphql
/// [`GraphQLError`]: https://github.com/graphql/graphql-js/blob/3869211/src/error/GraphQLError.js#L18-L75
/// [`errorWithCode`]: https://github.com/apollographql/federation/blob/714826efdcc3462c4f91dfe91c7ff8c3c76bad9b/internals-js/src/error.ts#L3-L25
/// [example]: https://github.com/apollographql/federation/blob/714826efdcc3462c4f91dfe91c7ff8c3c76bad9b/composition-js/src/merging/merge.ts#L448
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
    /// ...and many more!  See the `composition-js` composition library for
    /// more details (and search for the `error` method).
    code: String,
}
