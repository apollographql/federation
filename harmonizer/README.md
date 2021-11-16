# Harmonizer

This _harmonizer_ offers the ability to invoke a bundled version of the
JavaScript library, [`@apollo/composition`], which _composes_ multiple subgraphs
into a supergraph.

The bundled version of the federation library that is included is a JavaScript
Immediately Invoked Function Expression ([IIFE]) that is created by running the
[Rollup.js] bundler on the `@apollo/composition` package.

When the [`harmonize`] function that this crate provides is called with a
[`Vec<SubgraphDefinition>`] (which is synonymous with the terminology and service list
notion that exists within the JavaScript composition library), this crate uses
[`deno_core`] to invoke the JavaScript within V8.  This is ultimately
accomplished using [`rusty_v8`]'s V8 bindings to V8.

While we intend for a future version of composition to be done natively within
Rust, this allows us to provide a more stable transition using an already stable
composition implementation while we work toward something else.

[`@apollo/composition`]: https://npm.im/@apollo/composition
[IIFE]: https://developer.mozilla.org/en-US/docs/Glossary/IIFE
[Rollup.js]: http://rollupjs.org/
[`deno_core`]: https://crates.io/crates/deno_core
[`rusty_v8`]: https://crates.io/crates/rusty_v8
