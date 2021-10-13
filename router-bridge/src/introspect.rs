/*!
# Run introspection against a GraphQL schema and obtain the result
*/

use crate::js::Js;
use serde::{Deserialize, Serialize};
use std::fmt::Display;
use thiserror::Error;

/// An error which occurred during JavaScript introspection.
///
/// The shape of this error is meant to mimick that of the error created within
/// JavaScript, which is a [`GraphQLError`] from the [`graphql-js`] library.
///
/// [`graphql-js']: https://npm.im/graphql
/// [`GraphQLError`]: https://github.com/graphql/graphql-js/blob/3869211/src/error/GraphQLError.js#L18-L75
#[derive(Debug, Error, Serialize, Deserialize, PartialEq, Clone)]
pub struct IntrospectionError {
    /// A human-readable description of the error that prevented introspection.
    pub message: Option<String>,
}

impl Display for IntrospectionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(
            &self
                .message
                .as_ref()
                .map(std::string::String::as_str)
                .unwrap_or("UNKNOWN"),
        )
    }
}

/// If `batch_introspect` succeeds, it returns a `Vec<IntrospectionResponse>`.
///
/// `IntrospectionResponse` contains data, and a vec of eventual errors.
#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
pub struct IntrospectionResponse {
    /// The introspection response if batch_introspect succeeded
    #[serde(default)]
    data: Option<serde_json::Value>,
    /// The errors raised on this specific query if any
    #[serde(default)]
    errors: Option<Vec<IntrospectionError>>,
}

/// In some (rare) cases, executing a GraphQL query can return both errors and data.
///
/// This impl allows you to turn it into either data or errors, or get a reference to both.
impl IntrospectionResponse {
    /// `data` returns a reference to the underlying data
    ///
    /// use `into_result` if you don't want to use both data and errors.
    pub fn data(&self) -> Option<&serde_json::Value> {
        self.data.as_ref()
    }

    /// `errors` returns a reference to the underlying errors
    ///
    /// use `into_result` if you don't want to use both data and errors.
    pub fn errors(&self) -> Option<&Vec<IntrospectionError>> {
        self.errors.as_ref()
    }

    /// `into_result` will turn an IntrospectionResponse into either Ok(data) or Err(errors)
    pub fn into_result(self) -> Result<serde_json::Value, Vec<IntrospectionError>> {
        match (self.data, self.errors) {
            (Some(_), Some(errors)) if !errors.is_empty() => Err(errors),
            (Some(data), Some(errors)) if errors.is_empty() => Ok(data),
            (Some(data), None) => Ok(data),
            (None, Some(errors)) => Err(errors),
            _ => Err(vec![IntrospectionError {
                message: Some("neither data nor errors could be found".to_string()),
            }]),
        }
    }
}

/// The type returned when invoking `batch_introspect`
///
/// A global introspect error would be raised here, often meaning the sdl is invalid.
/// A successful call to `batch_introspect` doesn't mean each query succeeded,
/// refer to `IntrospectionResponse` to make sure each query ran successfully.
pub type IntrospectionResult = Result<Vec<IntrospectionResponse>, IntrospectionError>;

/// The `batch_introspect` function receives a [`string`] representing the SDL and invokes JavaScript
/// introspection on it, with the `queries` to run against the SDL.
///
pub fn batch_introspect(sdl: String, queries: Vec<String>) -> IntrospectionResult {
    Js::new()
        .with_parameter("sdl", sdl)
        .with_parameter("queries", queries)
        .execute::<Vec<IntrospectionResponse>, IntrospectionError>(
            "do_introspect",
            include_str!("../js-dist/do_introspect.js"),
        )
}

#[cfg(test)]
mod tests {
    use crate::introspect::batch_introspect;
    #[test]
    fn it_works() {
        let raw_sdl = r#"schema
        {
          query: Query
        }
  
        type Query {
          hello: String
        }
        "#;

        let introspected = batch_introspect(
            raw_sdl.to_string(),
            vec![DEFAULT_INTROSPECTION_QUERY.to_string()],
        )
        .unwrap();
        insta::assert_snapshot!(serde_json::to_string(&introspected).unwrap());
    }

    #[test]
    fn invalid_sdl() {
        use crate::introspect::IntrospectionError;
        let expected_error = IntrospectionError {
            message: Some(r#"Unknown type "Query"."#.to_string()),
        };
        let response = batch_introspect(
            "schema {
                query: Query
            }"
            .to_string(),
            vec![DEFAULT_INTROSPECTION_QUERY.to_string()],
        )
        .unwrap();

        assert_eq!(vec![expected_error], response[0].clone().errors.unwrap());
    }

    #[test]
    fn missing_introspection_query() {
        use crate::introspect::IntrospectionError;
        let expected_error = IntrospectionError {
            message: Some(r#"Unknown type "Query"."#.to_string()),
        };
        let response = batch_introspect(
            "schema {
                query: Query
            }"
            .to_string(),
            vec![DEFAULT_INTROSPECTION_QUERY.to_string()],
        )
        .unwrap();
        assert_eq!(expected_error, response[0].clone().errors.unwrap()[0]);
    }
    // This string is the result of calling getIntrospectionQuery() from the 'graphql' js package.
    static DEFAULT_INTROSPECTION_QUERY: &str = r#"
query IntrospectionQuery {
    __schema {
        queryType {
            name
        }
        mutationType {
            name
        }
        subscriptionType {
            name
        }
        types {
            ...FullType
        }
        directives {
            name
            description
            locations
            args {
                ...InputValue
            }
        }
    }
}

fragment FullType on __Type {
    kind
    name
    description

    fields(includeDeprecated: true) {
        name
        description
        args {
            ...InputValue
        }
        type {
            ...TypeRef
        }
        isDeprecated
        deprecationReason
    }
    inputFields {
        ...InputValue
    }
    interfaces {
        ...TypeRef
    }
    enumValues(includeDeprecated: true) {
        name
        description
        isDeprecated
        deprecationReason
    }
    possibleTypes {
        ...TypeRef
    }
}
    
fragment InputValue on __InputValue {
    name
    description
    type {
        ...TypeRef
    }
    defaultValue
}

fragment TypeRef on __Type {
    kind
    name
    ofType {
        kind
        name
        ofType {
            kind
            name
            ofType {
                kind
                name
                    ofType {
                    kind
                    name
                    ofType {
                        kind
                        name
                            ofType {
                            kind
                            name
                            ofType {
                                kind
                                name
                            }
                        }
                    }
                }
            }
        }
    }
}
"#;
}
