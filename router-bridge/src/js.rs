use crate::error::Error;
/// Wraps creating the Deno Js runtime collecting parameters and executing a script.
use deno_core::{op_sync, JsRuntime, RuntimeOptions, Snapshot};
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::sync::mpsc::channel;

pub(crate) struct Js {
    parameters: Vec<(&'static str, String)>,
}

impl Js {
    pub(crate) fn new() -> Js {
        Js {
            parameters: Vec::new(),
        }
    }

    pub(crate) fn with_parameter<T: Serialize>(
        mut self,
        name: &'static str,
        param: T,
    ) -> Result<Js, Error> {
        let serialized = format!(
            "{} = {}",
            name,
            serde_json::to_string(&param).map_err(|error| Error::ParameterSerialization {
                name: name.to_string(),
                message: error.to_string()
            })?
        );
        self.parameters.push((name, serialized));
        Ok(self)
    }

    pub(crate) fn execute<Ok: DeserializeOwned + 'static>(
        &self,
        name: &'static str,
        source: &'static str,
    ) -> Result<Ok, Error> {
        // The snapshot is created in our build.rs script and included in our binary image
        let buffer = include_bytes!("../snapshots/query_runtime.snap");

        // Use our snapshot to provision our new runtime
        let options = RuntimeOptions {
            startup_snapshot: Some(Snapshot::Static(buffer)),
            ..Default::default()
        };
        let mut runtime = JsRuntime::new(options);

        // We'll use this channel to get the results
        let (tx, rx) = channel();

        let happy_tx = tx.clone();

        runtime.register_op(
            "op_result",
            op_sync(move |_state, value, _buffer: ()| {
                happy_tx.send(Ok(value)).expect("channel must be open");

                Ok(serde_json::json!(null))

                // Don't return anything to JS
            }),
        );
        runtime.sync_ops_cache();
        for parameter in self.parameters.iter() {
            runtime
                .execute_script(format!("<{}>", parameter.0).as_str(), &parameter.1)
                .expect("unable to evaluate service list in JavaScript runtime");
        }

        // We are sending the error through the channel already
        let _ = runtime.execute_script(name, source).map_err(|e| {
            let message = format!(
                "unable to invoke {} in JavaScript runtime \n error: \n {:?}",
                source, e
            );

            tx.send(Err(Error::DenoRuntime(message)))
                .expect("channel must be open");

            e
        });

        rx.recv().expect("channel remains open")
    }
}
