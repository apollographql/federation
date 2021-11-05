/*!
# Create a query plan
*/

use crate::js::Js;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::fmt::{Display, Formatter};
use thiserror::Error;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
/// Options for the query plan
pub struct QueryPlanOptions {
    /// Use auto fragmentation
    pub auto_fragmentization: bool,
}

/// Default options for query planning
impl QueryPlanOptions {
    /// Default query plan options
    pub fn default() -> QueryPlanOptions {
        QueryPlanOptions {
            auto_fragmentization: false,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
/// This is the context which provides
/// all the information to plan a query against a schema
pub struct OperationalContext {
    /// The graphQL schema
    pub schema: String,
    /// The graphQL query
    pub query: String,
    /// The operation name
    pub operation_name: String,
}

#[derive(Debug, Error, Serialize, Deserialize, PartialEq)]
/// Container for planning errors
pub struct PlanningErrors {
    /// The contained errors
    pub errors: Vec<PlanningError>,
}

impl Display for PlanningErrors {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_fmt(format_args!(
            "Planning errors: {}",
            self.errors
                .iter()
                .map(|e| e.to_string())
                .collect::<Vec<String>>()
                .join(", ")
        ))
    }
}

/// An error which occurred during JavaScript planning.
///
/// The shape of this error is meant to mimic that of the error created within
/// JavaScript, which is a [`GraphQLError`] from the [`graphql-js`] library.
///
/// [`graphql-js`]: https://npm.im/graphql
/// [`GraphQLError`]: https://github.com/graphql/graphql-js/blob/3869211/src/error/GraphQLError.js#L18-L75
#[derive(Debug, Error, Serialize, Deserialize, PartialEq)]
pub struct PlanningError {
    /// A human-readable description of the error that prevented planning.
    pub message: Option<String>,
    /// [`PlanningErrorExtensions`]
    pub extensions: Option<PlanningErrorExtensions>,
}

impl Display for PlanningError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if let Some(msg) = &self.message {
            f.write_fmt(format_args!("{code}: {msg}", code = self.code(), msg = msg))
        } else {
            f.write_str(self.code())
        }
    }
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
/// Error codes
pub struct PlanningErrorExtensions {
    /// The error code
    pub code: String,
}

/// An error that was received during planning within JavaScript.
impl PlanningError {
    /// Retrieve the error code from an error received during planning.
    pub fn code(&self) -> &str {
        match self.extensions {
            Some(ref ext) => &*ext.code,
            None => "UNKNOWN",
        }
    }
}

/// Create the query plan by calling in to JS.
///
/// We use a generic here because the output type `QueryPlan` is part of the router.
/// Since this bridge is temporary we don't to declare the `QueryPlan` structure in this crate.
/// We will instead let the caller define what structure the plan result should be deserialized into.
pub fn plan<T: DeserializeOwned + 'static>(
    context: OperationalContext,
    options: QueryPlanOptions,
) -> Result<T, PlanningErrors> {
    Js::new()
        .with_parameter("schemaString", context.schema)
        .with_parameter("queryString", context.query)
        .with_parameter("options", options)
        .with_parameter("operationName", context.operation_name)
        .execute("do_plan", include_str!("../js-dist/do_plan.js"))
        .map_err(|errors| PlanningErrors { errors })
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCHEMA: &str = include_str!("testdata/schema.graphql");
    const QUERY: &str = include_str!("testdata/query.graphql");

    #[test]
    fn it_works() {
        insta::assert_snapshot!(serde_json::to_string_pretty(
            &plan::<serde_json::Value>(
                OperationalContext {
                    schema: SCHEMA.to_string(),
                    query: QUERY.to_string(),
                    operation_name: "".to_string()
                },
                QueryPlanOptions::default()
            )
            .unwrap()
        )
        .unwrap());
    }

    #[test]
    fn invalid_schema_is_caught() {
        let result = Err::<String, _>(PlanningErrors {
            errors: vec![PlanningError {
                message: Some("Syntax Error: Unexpected Name \"Garbage\".".to_string()),
                extensions: None,
            }],
        });
        assert_eq!(
            result,
            plan(
                OperationalContext {
                    schema: "Garbage".to_string(),
                    query: QUERY.to_string(),
                    operation_name: "".to_string(),
                },
                QueryPlanOptions::default(),
            )
        );
    }

    #[test]
    fn invalid_query_is_caught() {
        let result = Err::<String, _>(PlanningErrors {
            errors: vec![PlanningError {
                message: Some("Syntax Error: Unexpected Name \"Garbage\".".to_string()),
                extensions: None,
            }],
        });
        assert_eq!(
            result,
            plan(
                OperationalContext {
                    schema: SCHEMA.to_string(),
                    query: "Garbage".to_string(),
                    operation_name: "".to_string(),
                },
                QueryPlanOptions::default(),
            )
        );
    }

    #[test]
    fn query_missing_subfields() {
        let expected_error_message =
            r#"Invalid empty selection set for field "User.reviews" of non-leaf type [Review]"#;
        let result = Err::<String, _>(PlanningErrors {
            errors: vec![PlanningError {
                message: Some(expected_error_message.to_string()),
                extensions: None,
            }],
        });
        // This query contains reviews, which requires subfields
        let query_missing_subfields = "query ExampleQuery { me { id reviews } }".to_string();
        assert_eq!(
            result,
            plan(
                OperationalContext {
                    schema: SCHEMA.to_string(),
                    query: query_missing_subfields,
                    operation_name: "".to_string(),
                },
                QueryPlanOptions::default(),
            )
        );
    }

    #[test]
    fn query_field_that_doesnt_exist() {
        let expected_error_message = r#"Cannot query field "thisDoesntExist" on type "Query"."#;
        let result = Err::<String, _>(PlanningErrors {
            errors: vec![PlanningError {
                message: Some(expected_error_message.to_string()),
                extensions: None,
            }],
        });
        // This query contains reviews, which requires subfields
        let query_missing_subfields = "query ExampleQuery { thisDoesntExist }".to_string();
        assert_eq!(
            result,
            plan(
                OperationalContext {
                    schema: SCHEMA.to_string(),
                    query: query_missing_subfields,
                    operation_name: "".to_string(),
                },
                QueryPlanOptions::default(),
            )
        );
    }
}
