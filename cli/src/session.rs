use std::env::consts::OS;
use std::error::Error;
use std::fmt;

use url::Url;

/// The Session represents a usage of the CLI analogous to a web session
/// It contains the "url" (command path + flags) but doesn't contain any
/// values entered by the user. It also contains some identity information
/// for the user
#[derive(Clone)]
pub struct Session {
    /// the "route" of the command usage where commands are paths and flags are query strings
    /// i.e. ap schema push --graph --variant would become ap/schema/push?graph&variant
    route: Option<String>,

    /// the platform from which the command was run (i.e. linux, macOS, or windows)
    platform: String,

    /// optional user id of the user of the command
    user_id: Option<String>
}

fn get_route() -> Result<String, url::ParseError> {
    let url = Url::parse("ap:/")?;

    Ok(url.as_str().to_string())
}

impl Session {
    pub fn init() -> Session {
        Session {
            route: None,
            platform: OS.to_string(),
            user_id: None
        }
    }

    pub fn create_new_session(mut self) -> Result<Session, Box<dyn Error + 'static>> {
        self.route = Some(get_route()?);

        Ok(self)
    }

}


impl fmt::Display for Session {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let route = self.route.as_ref().unwrap();
        let mut string = String::new();
        string.push_str(&format!("route={},platform={}", route, self.platform));
        if self.user_id.is_some() {
            string.push_str(&format!(",user_id={}", self.user_id.as_ref().unwrap().to_string()));
        }

        write!(f, "{}", string)
    }
}