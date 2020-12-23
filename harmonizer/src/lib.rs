use deno_core::JsRuntime;
use deno_core::Op;
use serde::Serialize;
use std::io::Write;
use std::sync::mpsc::channel;

#[derive(Serialize)]
// When serialized, we'll be putting this into JavaScript expecting camelCase.
#[serde(rename_all = "camelCase")]
pub struct ServiceDefinition {
  pub name: &'static str,
  pub url: &'static str,
  pub type_defs: &'static str,
}

pub type ServiceList = Vec<ServiceDefinition>;

pub fn harmonize(service_list: ServiceList) -> String {
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
    move |_state, zero_copy| {      
      let mut result = String::new();

      // Write the contents of every buffer to stdout
      for buf in zero_copy {
        result.push_str(std::str::from_utf8(&buf).expect("utf8 conversion"));
      }

      tx.send(result).expect("channel must be open");

      Op::Sync(Box::new([])) // Don't return anything to JS
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

function done(string) {
  Deno.core.dispatchByName('op_composition_result', Deno.core.encode(string));
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

  rx.recv().expect("channel remains open")
}

#[cfg(test)]
mod tests {
  #[test]
  fn it_works() {
    use crate::{harmonize, ServiceDefinition};

    assert_eq!(
      harmonize(vec![
        ServiceDefinition {
          name: "users",
          url: "undefined",
          type_defs: "
            type User {
              id: ID
              name: String
            }

            type Query {
              users: [User!]
            }
          "
        },
        ServiceDefinition {
          name: "movies",
          url: "undefined",
          type_defs: "
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
        }
      ]),
      r#"schema @using(spec: "https://specs.apollo.dev/cs/v0.1")
{
  query: Query
}


directive @cs__key(graph: cs__Graph!)
  repeatable on FRAGMENT_DEFINITION

directive @cs__resolve(
  graph: cs__Graph!,
  requires: cs__SelectionSet,
  provides: cs__SelectionSet)
  on FIELD_DEFINITION

directive @cs__error(
  graphs: [cs__Graph!],
  message: String)
    on OBJECT
    | INTERFACE
    | UNION
    | FIELD_DEFINITION

directive @cs__link(to: cs__OutboundLink!)
  on ENUM_VALUE

input cs__OutboundLink {
  http: cs__OutboundLinkHTTP
}

input cs__OutboundLinkHTTP {
  url: cs__URL
}

scalar cs__URL @specifiedBy(url: "https://specs.apollo.dev/v0.1#cs__url")
scalar cs__SelectionSet @specifiedBy(url: "https://specs.apollo.dev/v0.1#cs__selectionset")


enum cs__Graph {
  users @cs__link(to: { http: { url: "undefined" } }),
  movies @cs__link(to: { http: { url: "undefined" } })
}

type Movie {
  title: String
  name: String
}

type Query {
  users: [User!] @cs__resolve(graph: users)
  movies: [Movie!] @cs__resolve(graph: movies)
}

type User {
  id: ID
  name: String
  favorites: [Movie!] @cs__resolve(graph: movies)
}
"#);
  }
}
