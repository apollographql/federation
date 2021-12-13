/// Wraps creating the Deno Js runtime collecting parameters and executing a script.
use deno_core::{op_sync, JsRuntime, RuntimeOptions, Snapshot};
use once_cell::sync::OnceCell;
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::sync::mpsc::channel;

static SNAPSHOT: OnceCell<Box<[u8]>> = OnceCell::new();

pub(crate) struct Js {
    parameters: Vec<(&'static str, String)>,
}

impl Js {
    pub(crate) fn new() -> Js {
        Js {
            parameters: Vec::new(),
        }
    }

    pub(crate) fn with_parameter<T: Serialize>(mut self, name: &'static str, param: T) -> Js {
        let serialized = format!(
            "{} = {}",
            name,
            serde_json::to_string(&param)
                .unwrap_or_else(|_| panic!("unable to serialize {} into JavaScript runtime", name))
        );
        self.parameters.push((name, serialized));
        self
    }

    pub(crate) fn execute<Ok: DeserializeOwned + 'static, Error: DeserializeOwned + 'static>(
        &self,
        name: &'static str,
        source: &'static str,
    ) -> Result<Ok, Error> {
        let init_snapshot = || {
            let options = RuntimeOptions {
                will_snapshot: true,
                ..Default::default()
            };
            let mut runtime = JsRuntime::new(options);
            // The runtime automatically contains a Deno.core object with several
            // functions for interacting with it.
            runtime
                .execute_script("<init>", include_str!("../js-dist/runtime.js"))
                .expect("unable to initialize router bridge runtime environment");

            runtime
                .execute_script(
                    "url_polyfill.js",
                    include_str!("../bundled/url_polyfill.js"),
                )
                .expect("unable to evaluate url_polyfill module");

            runtime
                .execute_script("<url_polyfill_assignment>", "whatwg_url_1 = url_polyfill;")
                .expect("unable to assign url_polyfill");

            // Load the composition library.
            runtime
                .execute_script("bridge.js", include_str!("../bundled/bridge.js"))
                .expect("unable to evaluate bridge module");

            runtime.snapshot().to_vec().into_boxed_slice()
        };

        // Try to get our snapshot
        let buffer = SNAPSHOT.get_or_init(init_snapshot);
        // Use our snapshot to provision our new runtime
        let options = RuntimeOptions {
            startup_snapshot: Some(Snapshot::Boxed((*buffer).clone())),
            ..Default::default()
        };
        let mut runtime = JsRuntime::new(options);

        // We'll use this channel to get the results
        let (tx, rx) = channel();

        runtime.register_op(
            "op_result",
            op_sync(move |_state, value, _buffer: ()| {
                tx.send(value).expect("channel must be open");

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

        runtime.execute_script(name, source).unwrap_or_else(|e| {
            panic!(
                "unable to invoke {} in JavaScript runtime \n error: \n {:?}",
                source, e
            )
        });

        rx.recv().expect("channel remains open")
    }
}
