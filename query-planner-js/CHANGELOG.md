# CHANGELOG for `@apollo/query-planner`

This CHANGELOG pertains only to Apollo Federation packages in the 2.x range. The Federation v0.x equivalent for this package can be found [here](https://github.com/apollographql/federation/blob/version-0.x/query-planner-js/CHANGELOG.md) on the `version-0.x` branch of this repo.

## vNEXT

> The changes noted within this `vNEXT` section have not been released yet.  New PRs and commits which introduce changes should include an entry in this `vNEXT` section as part of their development.  When a release is being prepared, a new header will be (manually) created below and the appropriate changes within that release will be moved into the new section.

- _Nothing yet! Stay tuned!_

## v2.0.0-preview.2

- Re-publishing release which published to npm with stale build artifacts from `version-0.x` release.


## v2.0.0-preview.1

- No-op publish to account for publishing difficulties.

## v2.0.0-preview.0

- Initial "preview" release.

## v2.0.0-alpha.6

- Avoid incomplete subgraphs when extracting them from the supergraph. [PR #1511](https://github.com/apollographql/federation/pull/1511) (via fix to `@apollo/federation-internals`)
- Add an `operationKind` property to the query plan which will be either `query` or `mutation`.  This allows data sources to make decisions about the subgraph request without needing to re-parse the operation. [PR #1427](https://github.com/apollographql/federation/pull/1427)

## v2.0.0-alpha.5

- Fix potentially inefficient query plans with multiple `@requires` [PR #1431](https://github.com/apollographql/federation/pull/1431).
- Remove `graphql@15` from peer dependencies [PR #1472](https://github.com/apollographql/federation/pull/1472).

## v2.0.0-alpha.3

- Fix bug in handling of large number of query plan options [1316](https://github.com/apollographql/federation/pull/1316).

## v2.0.0-alpha.2

- __BREAKING__: Bump graphql peer dependency to `^15.7.0` [PR #1200](https://github.com/apollographql/federation/pull/1200)
- Fix the handling of nested `@provides` directives [PR #1148](https://github.com/apollographql/federation/pull/1148).
- Fix query planner sending queries to a subgraph involving interfaces it doesn't know [#817](https://github.com/apollographql/federation/issues/817).

## v2.0.0-alpha.1

- :tada: Initial alpha release of Federation 2.0.  For more information, see our [documentation](https://www.apollographql.com/d      ocs/federation/v2/).  We look forward to your feedback!

## v0.5.2

- Updates to transitive dependencies.  No other substantial changes.

## v0.5.1

- Adjustments to internal TypeScript types [PR #1030](https://github.com/apollographql/federation/pull/1030)

## v0.5.0

- __BREAKING__: This is a breaking change due to a `peerDependencies` update (`graphql@^15.4.0` -> `graphql@^15.5.3`). This `graphql` version includes a fix which is being necessarily adopted within the `@apollo/federation` package. See associated CHANGELOG entry in the `federation-js` folder for additional details. [PR #1008](https://github.com/apollographql/federation/pull/1008)

## v0.3.1

- Narrow `graphql` peer dependency to a more fitting range `^15.4.0` based on our current usage of the package. This requirement was introduced by, but not captured in, changes within the recently released `@apollo/query-planner@0.3.0`. As such, this change will be released as a `patch` since the breaking change already accidentally happened and this is a correction to that oversight. [PR #913](https://github.com/apollographql/federation/pull/913)

# v0.3.0

-  Introduce support for removing @inaccessible elements from the API schema. [PR #807](https://github.com/apollographql/federation/pull/859)
- Mask inaccessible typenames in runtime operation errors. [PR #893](https://github.com/apollographql/federation/pull/893)

# v0.2.3

- Permit @tag and @inaccessible core declarations. [PR #859](https://github.com/apollographql/federation/pull/859)

# v0.2.2

- types: Explicitly declare `FetchGroup[]` return type from `dependentGroups` in `buildQueryPlan`.

# v0.2.1

- Fix plan querying a subgraph with an interface it doesn't know due to directives. [PR #805](https://github.com/apollographql/federation/pull/805) [Issue #801](https://github.com/apollographql/federation/issues/801)

# v0.2.0

- Expand the range of supported `node` versions in the package's `engines` specifier to include the now-tested Node.js `16`. [PR #713](https://github.com/apollographql/federation/pull/713)

# v0.1.4

- Add missing `deep-equal` dependency, which was accidentally installed to the monorepo's root. [PR #709](https://github.com/apollographql/federation/pull/709)

# v0.1.3

- Fix query plans missing fields in some situations involving nested type conditions (#396).
- Fix duplicate fetches in query plans [PR #671](https://github.com/apollographql/federation/pull/671).

# v0.1.2

- This change is mostly a set of follow-up changes for PR #622. Most of these changes are internal (renaming, etc.). Some noteworthy changes worth mentioning are: the splitting of entity and value type metadata types and a conversion of GraphMap to an actual `Map` (which resulted in some additional assertions). [PR #656](https://github.com/apollographql/federation/pull/656)

# v0.1.1

- Remove unnecessary dependency on `@apollo/query-planner-wasm`

# v0.1.0

- Initial release of TypeScript query planner code extracted from `@apollo/gateway`. (Previous releases of this package were wrappers around `@apollo/query-planner-wasm`, a different implementation.)

