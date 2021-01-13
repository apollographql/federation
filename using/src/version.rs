use std::{num::ParseIntError, str::FromStr};

use lazy_static::lazy_static;
use regex::Regex;
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Version(pub u64, pub u64);

impl Version {
    pub fn parse(input: &str) -> Result<Version, VersionParseError> {
        lazy_static! {
            static ref VERSION_RE: Regex = Regex::new(r#"^v(\d+)\.(\d+)$"#).unwrap();
        }

        if let Some(ver) = VERSION_RE.captures(input) {
            Ok(Version(ver[1].parse()?, ver[2].parse()?))
        } else {
            Err(VersionParseError)
        }
    }

    pub fn satisfies(&self, required: &Version) -> bool {
        let Version(major, minor) = self;
        let Version(r_major, r_minor) = required;
        r_major == major && (
            *major == 0 && r_minor == minor ||
            r_minor <= minor
        )
    }
}

impl FromStr for Version {
    type Err = VersionParseError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Version::parse(s)
    }
}

#[derive(Error, Debug, Clone, Copy)]
#[error("error parsing version specifier")]
pub struct VersionParseError;

impl From<ParseIntError> for VersionParseError {
    fn from(_: ParseIntError) -> Self { Self }
}
