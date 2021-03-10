# CHANGELOG for `@apollo/query-planner-wasm`

## vNEXT

> The changes noted within this `vNEXT` section have not been released yet.  New PRs and commits which introduce changes should include an entry in this `vNEXT` section as part of their development.  When a release is being prepared, a new header will be (manually) created below and the appropriate changes within that release will be moved into the new section.

-  _Nothing yet! Stay tuned!_

## v0.2.3

- Adjust the way that the packages are included in the distribution and prune files that are unnecessary or causing conflict with intentions (like `.gitignore`).  [PR #557](https://github.com/apollographql/federation/pull/557)

## v0.2.2

- Fix an error caused by a lacking relatively prefix on the items in `exports`, following up [PR #270](https://github.com/apollographql/federation/pull/270)

## v0.2.0

- To facilitate interoperability with bundlers (e.g., Webpack) attempting to bundle this package which includes a WASM module, we will also now generate a ECMAScript Module (ESM) entry-point for this package _in addition to the existing CommonJS (CJS) bundle.  This new ESM entry-point is conveyed via the [`exports` object within the `package.json`](https://nodejs.org/api/packages.html#packages_exports) of the published package.  It's worth noting that package has always had a WebAssembly (WASM; `.wasm`) module inside of it which was produced with [`wasm-pack`](https://github.com/rustwasm/wasm-pack) but, prior to this change, we'd been specifying the [`--target nodejs`](https://rustwasm.github.io/wasm-pack/book/commands/build.html#target) flag to `wasm-pack build`.  [PR #270](https://github.com/apollographql/federation/pull/270)  [Issue #255](https://github.com/apollographql/federation/issues/255)
