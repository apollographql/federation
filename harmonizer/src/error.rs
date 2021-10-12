use std::{
    error::Error,
    fmt::{self, Display},
};

use serde::{ser::SerializeSeq, Deserialize, Serialize, Serializer};

use crate::CompositionError;

/// This error type encapsulates all of the composition errors for a supergraph,
/// implements the `std::error::Error` trait, and can be serialized to well-formed JSON
#[derive(Debug, Deserialize, Default, Clone, PartialEq)]
pub struct CompositionErrors {
    composition_errors: Vec<CompositionError>,
}

impl CompositionErrors {
    #[cfg(test)]
    pub(crate) fn new() -> CompositionErrors {
        CompositionErrors {
            composition_errors: Vec::new(),
        }
    }
}

impl Serialize for CompositionErrors {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut sequence = serializer.serialize_seq(Some(self.composition_errors.len()))?;
        for composition_error in &self.composition_errors {
            sequence.serialize_element(composition_error)?;
        }
        sequence.end()
    }
}

impl Display for CompositionErrors {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let num_failures = self.composition_errors.len();
        if num_failures == 0
            || (num_failures == 1 && self.composition_errors[0].to_string() == "UNKNOWN")
        {
            writeln!(f, "Something went wrong! No composition errors were recorded, but we also couldn't compose a valid supergraph SDL.")?;
        } else {
            let length_message = if num_failures == 1 {
                "1 composition error".to_string()
            } else {
                format!("{} composition errors", num_failures)
            };
            writeln!(
                f,
                "Encountered {} while trying to compose the supergraph.",
                &length_message
            )?;
            for composition_error in &self.composition_errors {
                writeln!(f, "{}", composition_error)?;
            }
        }
        Ok(())
    }
}

impl From<Vec<CompositionError>> for CompositionErrors {
    fn from(composition_errors: Vec<CompositionError>) -> Self {
        CompositionErrors { composition_errors }
    }
}

impl Error for CompositionErrors {}

#[cfg(test)]
mod tests {
    use super::{CompositionError, CompositionErrors};

    use serde_json::{json, Value};

    #[test]
    fn it_can_serialize_empty_errors() {
        let composition_errors = CompositionErrors::new();
        assert_eq!(
            serde_json::to_string(&composition_errors).expect("Could not serialize build errors"),
            json!([]).to_string()
        );
    }

    #[test]
    fn it_can_serialize_some_composition_errors() {
        let composition_errors: CompositionErrors = vec![
            CompositionError::new("CODE_ONE".to_string(), None),
            CompositionError::new("CODE_TWO".to_string(), Some("BOO".to_string())),
        ]
        .into();

        let actual_value: Value = serde_json::from_str(
            &serde_json::to_string(&composition_errors)
                .expect("Could not convert composition errors to string"),
        )
        .expect("Could not convert composition error string to serde_json::Value");

        let expected_value = json!([
          {
            "code": "CODE_ONE",
            "message": null,
          },
          {
            "code": "CODE_TWO",
            "message": "BOO",
          }
        ]);
        assert_eq!(actual_value, expected_value);
    }
}
