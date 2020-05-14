pub mod login;
pub mod print;
pub mod schema;
pub mod setup;

pub use login::Login;
pub use print::Print;
pub use setup::Setup;
pub use schema::Schema;

use crate::errors::{ExitCode, Fallible};

pub trait Command {
    /// Executes the command. Returns `Ok(true)` if the process should return 0,
    /// `Ok(false)` if the process should return 1, and `Err(e)` if the process
    /// should return `e.exit_code()`.
    fn run(&self) -> Fallible<ExitCode>;
}
