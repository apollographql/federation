use deno_core::Op;
use deno_core::{json_op_sync, JsRuntime};
use serde::{Deserialize, Serialize};
use std::sync::mpsc::channel;
use std::{fmt::Display, io::Write};
use thiserror::Error;

#[derive(Serialize)]
// When serialized, we'll be putting this into JavaScript expecting camelCase.
#[serde(rename_all = "camelCase")]
pub struct ServiceDefinition {
    pub name: String,
    pub url: String,
    pub type_defs: String,
}

impl ServiceDefinition {
    pub fn new<N: Into<String>, U: Into<String>, D: Into<String>>(
        name: N,
        url: U,
        type_defs: D,
    ) -> ServiceDefinition {
        ServiceDefinition {
            name: name.into(),
            url: url.into(),
            type_defs: type_defs.into(),
        }
    }
}

pub type ServiceList = Vec<ServiceDefinition>;

#[derive(Debug, Error, Serialize, Deserialize, PartialEq)]
pub struct CompositionError {
    pub message: Option<String>,
    pub extensions: Option<CompositionErrorExtensions>,
}

impl Display for CompositionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if let Some(msg) = &self.message {
            f.write_fmt(format_args!("{code}: {msg}", code = self.code(), msg = msg))
        } else {
            f.write_str(self.code())
        }
    }
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct CompositionErrorExtensions {
    pub code: String,
}

impl CompositionError {
    pub fn code(&self) -> &str {
        if let Some(ref ext) = self.extensions {
            ext.code.as_str()
        } else {
            "UNKNOWN"
        }
    }
}

pub fn harmonize(service_list: ServiceList) -> Result<String, Vec<CompositionError>> {
    // Initialize a runtime instance
    let mut runtime = JsRuntime::new(Default::default());

    // We'll use this channel to get the results
    let (tx, rx) = channel();

    // The first thing we do is define an op so we can print data to STDOUT,
    // because by default the JavaScript console functions are just stubs (they
    // don't do anything).

    // Register the op for outputting bytes to stdout. It can be invoked with
    // Deno.core.dispatch and the id this method returns or
    // Deno.core.dispatchByName and the name provided.
    runtime.register_op(
        "op_print",
        // The op_fn callback takes a state object OpState
        // and a vector of ZeroCopyBuf's, which are mutable references
        // to ArrayBuffer's in JavaScript.
        |_state, zero_copy| {
            let mut out = std::io::stdout();

            // Write the contents of every buffer to stdout
            for buf in zero_copy {
                out.write_all(&buf).unwrap();
            }

            Op::Sync(Box::new([])) // No meaningful result
        },
    );

    runtime.register_op(
        "op_composition_result",
        json_op_sync(move |_state, value, _zero_copy| {
            tx.send(serde_json::from_value(value).expect("deserializing composition result"))
                .expect("channel must be open");

            Ok(serde_json::json!(null))

            // Op::Sync(Box::new([])) // Don't return anything to JS
        }),
    );

    // The runtime automatically contains a Deno.core object with several
    // functions for interacting with it.
    runtime
        .execute(
            "<init>",
            r#"
// First we initialize the ops cache.
// This maps op names to their id's.
Deno.core.ops();

// Then we define a print function that uses
// our op_print op to display the stringified argument.
const _newline = new Uint8Array([10]);
function print(value) {
  Deno.core.dispatchByName('op_print', Deno.core.encode(value.toString()), _newline);
}

function done(result) {
  Deno.core.jsonOpSync('op_composition_result', result);
}

// Finally we register the error class used during do_compose.js.
// so that it throws the correct class.
Deno.core.registerErrorClass('Error', Error);

// We build some of the preliminary objects that our Rollup-built package is
// expecting to be present in the environment.
// node_fetch_1 is an unused external dependency we don't bundle.  See the
// configuration in this package's 'rollup.config.js' for where this is marked
// as an external dependency and thus not packaged into the bundle.
node_fetch_1 = {};
// 'process' is a Node.js ism.  We rely on process.env.NODE_ENV, in
// particular, to determine whether or not we are running in a debug
// mode.  For the purposes of harmonizer, we don't gain anything from
// running in such a mode.
process = { env: { "NODE_ENV": "production" }};
// Some JS runtime implementation specific bits that we rely on that
// need to be initialized as empty objects. 
global = {};
exports = {};
"#,
        )
        .unwrap();

    // Load the composition library.
    runtime
        .execute("composition.js", include_str!("../dist/composition.js"))
        .unwrap();

    // We literally just turn it into a JSON object that we'll execute within
    // the runtime.
    let service_list_javascript = format!(
        "serviceList = {}",
        serde_json::to_string(&service_list).unwrap()
    );

    runtime
        .execute("<set_service_list>", &service_list_javascript)
        .unwrap();

    runtime
        .execute("do_compose.js", include_str!("../js/do_compose.js"))
        .unwrap();

    rx.recv().expect("channel remains open")
}

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        use crate::{harmonize, ServiceDefinition};

        insta::assert_snapshot!(harmonize(vec![
            ServiceDefinition::new(
                "users",
                "undefined",
                "
            type User {
              id: ID
              name: String
            }

            type Query {
              users: [User!]
            }
          "
            ),
            ServiceDefinition::new(
                "movies",
                "undefined",
                "
            type Movie {
              title: String
              name: String
            }

            extend type User {
              favorites: [Movie!]
            }

            type Query {
              movies: [Movie!]
            }
          "
            )
        ])
        .unwrap());
    }
}
