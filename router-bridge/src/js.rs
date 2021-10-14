/// Wraps creating the Deno Js runtime collecting parameters and executing a script.
use deno_core::{op_sync, JsRuntime};
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::io::Write;
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
            // The op_fn callback takes a state object OpState,
            // a structured arg of type `T` and an optional ZeroCopyBuf,
            // a mutable reference to a JavaScript ArrayBuffer
            op_sync(|_state, _msg: Option<String>, zero_copy| {
                let mut out = std::io::stdout();

                // Write the contents of every buffer to stdout
                if let Some(buf) = zero_copy {
                    out.write_all(&buf)
                        .expect("failure writing buffered output");
                }

                Ok(()) // No meaningful result
            }),
        );

        runtime.register_op(
            "op_result",
            op_sync(move |_state, value, _zero_copy| {
                tx.send(value).expect("channel must be open");

                Ok(serde_json::json!(null))

                // Don't return anything to JS
            }),
        );

        // The runtime automatically contains a Deno.core object with several
        // functions for interacting with it.
        runtime
            .execute("<init>", include_str!("../js-dist/runtime.js"))
            .expect("unable to initialize router bridge runtime environment");

        runtime
            .execute(
                "url_polyfill.js",
                include_str!("../bundled/url_polyfill.js"),
            )
            .expect("unable to evaluate url_polyfill module");

        runtime
            .execute("<url_polyfill_assignment>", "whatwg_url_1 = url_polyfill;")
            .expect("unable to assign url_polyfill");

        // Load the composition library.
        runtime
            .execute("bridge.js", include_str!("../bundled/bridge.js"))
            .expect("unable to evaluate bridge module");

        for parameter in self.parameters.iter() {
            runtime
                .execute(format!("<{}>", parameter.0).as_str(), &parameter.1)
                .expect("unable to evaluate service list in JavaScript runtime");
        }

        runtime.execute(name, source).unwrap_or_else(|e| {
            panic!(
                "unable to invoke {} in JavaScript runtime \n error: \n {:?}",
                source, e
            )
        });

        rx.recv().expect("channel remains open")
    }
}
