use crate::errors::{ErrorDetails, Fallible};
use atty::Stream;
use console::Term;
use log::debug;

// For interactively handling user input
// Handles reading from stdin, or interactive user input.
pub fn input(msg: &str) -> Fallible<String> {
    input_or_sensitive(msg, false)
}

// For interactively handling sensitive user input
// Handles reading from stdin, or redacted interactive user input.
pub fn sensitive(msg: &str) -> Fallible<String> {
    input_or_sensitive(msg, true)
}

fn input_or_sensitive(msg: &str, sensitive: bool) -> Fallible<String> {
    println!("{}", msg);
    let terminal = Term::stdout();

    let mut response: String = if !sensitive {
        debug!("Reading...");
        read!("{}\n")
    } else if !atty::is(Stream::Stdin) {
        debug!("Reading from non-interactive stream...");
        read!("{}\n")
    } else {
        debug!("Reading secure line from tty...");
        terminal.read_secure_line().unwrap()
    };

    response = String::from(response.trim()); // remove whitespace
    Ok(response)
}

// Truncate all "yes", "no" responses for interactive delete prompt to just "y" or "n".
const INTERACTIVE_RESPONSE_LEN: usize = 1;
const YES: &str = "y";
const NO: &str = "n";

// For interactively handling deletes (and discouraging accidental deletes).
// Input like "yes", "Yes", "no", "No" will be accepted, thanks to the whitespace-stripping
// and lowercasing logic below.
pub fn confirm(msg: &str) -> Fallible<bool> {
    let mut response: String = input(&format!("{} [y/n]", msg))?;
    response.make_ascii_lowercase(); // ensure response is all lowercase
    response.truncate(INTERACTIVE_RESPONSE_LEN); // at this point, all valid input will be "y" or "n"

    match response.as_ref() {
        YES => Ok(true),
        NO => Ok(false),
        _ => Err(ErrorDetails::InputConfirmationError.into()),
    }
}
