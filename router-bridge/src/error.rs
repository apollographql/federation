/*!
# Errors raised by the `router-bridge` when trying to run `javascript`.
*/

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Serialize, Deserialize, Debug)]
/// An error which occurred within the bridge.
///
/// This does not include JS domain related errors, such as [`GraphQLError`].
pub enum Error {
    /// An uncaught error was raised when invoking a custom script.
    ///
    /// This contains the script invocation error message.
    #[error("the deno runtime raised an error: `{0}`")]
    JSRuntimeError(String),
}
