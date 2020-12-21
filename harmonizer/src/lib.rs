use deno_core::JsRuntime;
use deno_core::Op;
use serde::Serialize;
use std::io::Write;

#[derive(Serialize)]
// When serialized, we'll be putting this into JavaScript expecting camelCase.
#[serde(rename_all = "camelCase")]
pub struct ServiceDefinition {
  pub name: &'static str,
  pub url: &'static str,
  pub type_defs: &'static str,
}

pub type ServiceList = Vec<ServiceDefinition>;

pub fn harmonize(service_list: ServiceList) {
  // Initialize a runtime instance
  let mut runtime = JsRuntime::new(Default::default());

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

// Finally we register the error class used during do_compose.js.
// so that it throws the correct class.
Deno.core.registerErrorClass('Error', Error);

// We build some of the preliminary objects that our Rollup-built package is
// expecting to be present in the environment.
node_fetch_1 = {}; // This is an unused external dependency we don't bundle.
process = { env: { "NODE_ENV": "production" }};
global = {};
exports = {};
"#,
    )
    .unwrap();

  // Load the composition library.
  runtime
    .execute("composition.js", include_str!("composition.js"))
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
    .execute("do_compose.js", include_str!("do_compose.js"))
    .unwrap();
}

#[cfg(test)]
mod tests {
  #[test]
  fn it_works() {
    assert_eq!(2 + 2, 4);
  }
}
