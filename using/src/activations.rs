//! Methods to select which of a set of implementations to activate based on a schema's
//! `Request`s.

use crate::{Find, Request, Schema, Version};

/// An Activation references a request and contains the min and max versioned implementations
/// available in the implementation registry which can satisfy that request, or None if no
/// matching implementations were available.
#[derive(Debug, PartialEq, Eq)]
pub struct Activation<'schema, 'impls, T> {
    pub request: &'schema Request,
    pub min: Option<(&'impls Version, &'impls T)>,
    pub max: Option<(&'impls Version, &'impls T)>,
}

impl<'a> Schema<'a> {
    /// Given a set of implementations, take all requests in the document and
    /// return an iterator over `Activation`s containing the min- and max-
    /// versioned implementations which will satisfy the request if any such
    /// implementations are available.
    pub fn activations<'impls, T, F>(&'impls self, implementations: &'impls F) -> impl Iterator<Item=Activation<'a, 'impls, T>> + 'impls
        where
            'impls: 'a,
            T: 'impls,
            F: Find<T>
    {
        self.using.iter()
            .map(move |req| (
                req,
                implementations.find_min_req(req),
                implementations.find_max_req(req),
            ))
            .map(|(request, min, max)|
                Activation { request, min, max }
            )
    }
}

#[cfg(test)]
mod tests {
    use graphql_parser::ParseError;
    use crate::*;
    
    #[test]
    fn it_iterates_over_activations() -> Result<(), ParseError> {
        let implementations = Implementations::new()
            .provide("https://spec.example.com/A", Version(1, 2), "impl A v1.2".to_owned())
            .provide("https://spec.example.com/B", Version(1, 2), "impl B v1.2".to_owned());

        let mut expected = vec![
r#"Activation {
    request: Request {
        spec: Spec {
            identity: "https://spec.example.com/A",
            default_prefix: "A",
            version: Version(
                1,
                0,
            ),
        },
        prefix: "A",
        position: Pos(3:17),
    },
    min: Some(
        (
            Version(
                1,
                2,
            ),
            "impl A v1.2",
        ),
    ),
    max: Some(
        (
            Version(
                1,
                2,
            ),
            "impl A v1.2",
        ),
    ),
}"#,
r#"Activation {
    request: Request {
        spec: Spec {
            identity: "https://spec.example.com/unknown",
            default_prefix: "unknown",
            version: Version(
                1,
                0,
            ),
        },
        prefix: "unknown",
        position: Pos(4:17),
    },
    min: None,
    max: None,
}"#
        ];
        expected.reverse();

        Schema::parse(r#"
            schema
                @using(spec: "https://spec.example.com/A/v1.0")
                @using(spec: "https://spec.example.com/unknown/v1.0")
            {
                query: Query
            }
        "#)?
            .activations(&implementations)
            .for_each(|req|
                assert_eq!(expected.pop().unwrap(), format!("{:#?}", req)));
        
        Ok(())
    }
}