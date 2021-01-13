use thiserror::Error;
use url;
use url::Url;

use crate::{
    version,
    version::Version,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Spec {
    pub identity: String,
    pub default_prefix: String,
    pub version: Version,
}

#[derive(Debug, PartialEq, Eq, Clone, Error)]
pub enum SpecParseError {
    #[error("error parsing url")]
    UrlParseError(url::ParseError),

    #[error("error parsing version specifier")]
    VersionParseError,

    #[error("url does not have a path")]
    NoPath,

    #[error("url does specify a version")]
    NoVersion,

    #[error("url does not specify a prefix")]
    NoDefaultPrefix,
}

impl From<url::ParseError> for SpecParseError {
    fn from(error: url::ParseError) -> Self {
        Self::UrlParseError(error)
    }
}

impl From<version::VersionParseError> for SpecParseError {
    fn from(_: version::VersionParseError) -> Self { Self::VersionParseError }
}

impl Spec {
    pub fn parse(input: &str) -> Result<Spec, SpecParseError> {
        use SpecParseError::*;

        let mut parsed = Url::parse(input)?;            
        let mut path: Vec<_> = parsed.path_segments().ok_or(NoPath)?
            .map(|x| x.to_owned())
            .collect();
        let version = path.pop().ok_or(NoVersion)?;
        let version = Version::parse(&version)?;
        let default_prefix = path.last().ok_or(NoDefaultPrefix)?;
        parsed.set_fragment(None);        
        let _ = parsed.set_username("");
        parsed.set_query(None);
        let _ = parsed.set_password(None);
        parsed.set_path(&path.join("/"));
        
        Ok(Spec {
            identity: parsed.to_string(),
            default_prefix: default_prefix.into(),
            version,
        })
    }
}
