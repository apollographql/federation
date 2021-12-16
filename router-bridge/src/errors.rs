/*!
# Errors raised by the `router-bridge` when trying to run `javascript`.
*/

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, PartialEq)]
/// An error which occurred within the bridge.
///
/// This does not include JS domain related errors, such as [`GraphQLError`].
pub enum Errors {
    /// An uncaught error was raised when invoking a custom script.
    ///
    /// This contains the script invocation error message `String`,
    /// as well as the script that was attempted to run.
    JSRuntimeError(String),
}
