mod utils;
pub use utils::*; // this gets rid of a dead code warning.

#[cfg(unix)]
mod unix {
    use assert_cmd::prelude::*;
    use predicates::prelude::*;

    use crate::utils;

    #[test]
    fn no_command_used() -> Result<(), Box<dyn std::error::Error>> {
        let mut cli = utils::get_cli().command;

        cli.assert()
            .code(0)
            .stdout(predicate::str::contains("USAGE"));

        Ok(())
    }
}
