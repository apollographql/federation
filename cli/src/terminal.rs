use crate::errors::ErrorDetails;
use console::Term;

// For interactively handling user input
pub fn input(msg: &str, sensitive: bool) -> Result<String, ErrorDetails> {
    println!("{}", msg);
    let terminal = Term::stdout();

    let mut response: String = if !(sensitive && terminal.is_term()) {
        read!("{}\n")
    } else {
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
pub fn confirm(msg: &str) -> Result<bool, ErrorDetails> {
    let mut response: String = input(&format!("{} [y/n]", msg))?;
    response.make_ascii_lowercase(); // ensure response is all lowercase
    response.truncate(INTERACTIVE_RESPONSE_LEN); // at this point, all valid input will be "y" or "n"

    match response.as_ref() {
        YES => Ok(true),
        NO => Ok(false),
        _ => Err(ErrorDetails::InputConfirmationError),
    }
}
