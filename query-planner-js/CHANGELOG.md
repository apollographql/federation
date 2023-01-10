# CHANGELOG for `@apollo/query-planner`

This CHANGELOG pertains only to Apollo Federation packages in the 2.x range. The Federation v0.x equivalent for this package can be found [here](https://github.com/apollographql/federation/blob/version-0.x/query-planner-js/CHANGELOG.md) on the `version-0.x` branch of this repo.

## vNext

- Fix potential issue with nested `@defer` in non-deferrable case [PR #2312](https://github.com/apollographql/federation/pull/2312).
- Fix possible assertion error during query planning [PR #2299](https://github.com/apollographql/federation/pull/2299).
- Improves generation of plans once all path options are computed [PR #2316](https://github.com/apollographql/federation/pull/2316).

## 2.2.2

- Fix issue with path in query plan's deferred nodes [PR #2281](https://github.com/apollographql/federation/pull/2281).
  - __BREAKING__: Any code relying directly on the query plan handling of `@defer` will need to potentially update its
      handling of the `path` before upgrading to this version. This is *not* a concern for end-user of federation. 

## 2.2.0

- __BREAKING__: Disable exposing full document to sub-query by default (introduced in 2.1.0):
  - This change decreases memory consumption in general (which is the reason for disabling this by
    default), but users that have custom code making use of `GraphQLDataSourceProcessOptions.document`
    will now need to explicitly set `GatewayConfig.queryPlannerConfig.exposeDocumentNodeInFetchNode`.
- Drop support for node12 [PR #2202](https://github.com/apollographql/federation/pull/2202)
- Avoid reusing named fragments that are invalid for the subgraph [PR #2255](https://github.com/apollographql/federation/pull/2255).
- Fix QP not always type-exploding interface when necessary [PR #2246](https://github.com/apollographql/federation/pull/2246).
- Fix potential QP issue with shareable root fields [PR #2239](https://github.com/apollographql/federation/pull/2239).

## 2.1.4

- Optimize plan for defer where only keys are fetched [PR #2182](https://github.com/apollographql/federation/pull/2182).

## 2.1.3

- Fix building subgraph selections using the wrong underlying schema [PR #2155](https://github.com/apollographql/federation/pull/2155).

## 2.1.2

- Fix issue with path #2137 (optimization for `__typename`) [PR #2140](https://github.com/apollographql/federation/pull/2140).
- Fix potential inefficient planning due to `__typename` [PR #2137](https://github.com/apollographql/federation/pull/2137).
- Fix potential assertion during query planning [PR #2133](https://github.com/apollographql/federation/pull/2133).
- Fix some defer query plans having invalid result sets (with empty branches) [PR #2125](https://github.com/apollographql/federation/pull/2125). 
- Fix defer information lost when cloning fetch group (resulting in non-deferred parts) [PR #2129](https://github.com/apollographql/federation/pull/2129).
- Fix directives on fragment spread being lost [PR #2126](https://github.com/apollographql/federation/pull/2126).

## 2.1.1

- Fix issue where @defer condition gets ignored [PR #2121](https://github.com/apollographql/federation/pull/2121).

## 2.1.0

- Fix issue where fragment expansion can erase applied directives (most notably `@defer`) [PR #2093](https://github.com/apollographql/federation/pull/2093).
- Fix issue with fragment reusing code something mistakenly re-expanding fragments [PR #2098](https://github.com/apollographql/federation/pull/2098).
- Update peer dependency `graphql` to `^16.5.0` to use `GraphQLErrorOptions` [PR #2060](https://github.com/apollographql/federation/pull/2060)
- Add `@defer` support [PR #1958](https://github.com/apollographql/federation/pull/1958)
- Fix fragment reuse in subgraph fetches [PR #1911](https://github.com/apollographql/federation/pull/1911).
- Expose document representation of sub-query request within GraphQLDataSourceProcessOptions so that it is available to RemoteGraphQLDataSource.process and RemoteGraphQLDataSource.willSendRequest [PR #1878](https://github.com/apollographql/federation/pull/1878)
- Fix issue computing query plan costs that can lead to extra unnecessary fetches [PR #1937](https://github.com/apollographql/federation/pull/1937).
- Avoid type-explosion with fed1 supergraphs using a fed2 query planner [PR #1994](https://github.com/apollographql/federation/pull/1994).
- Expand support for Node.js v18 [PR #1884](https://github.com/apollographql/federation/pull/1884)

## 2.0.3

- Fix issue with `@requires` and conditional queries (`@include`/`@skip`) [1835](https://github.com/apollographql/federation/pull/1835).
- Fix bug with field covariance when the underlying plan use type-explosion [1859](https://github.com/apollographql/federation/pull/1859).

## 2.0.2

- Fix handling of @require "chains" (a @require whose fields have @require themselves) [PR #1790](https://github.com/apollographql/federation/pull/1790)
- Improve merging of groups during `@require` handling in query planning [PR #1732](https://github.com/apollographql/federation/pull/1732)

## v2.0.1

- Released in sync with other federation packages but no changes to this package.

## v2.0.0

- Previous preview release promoted to general availability! Please see previous changelog entries for full info.

## v2.0.0-preview.9

- Adds Support for `@tag/v0.2`, which allows the `@tag` directive to be additionally placed on arguments, scalars, enums, enum values, input objects, and input object fields. [PR #1652](https://github.com/apollographql/federation/pull/1652).
- Adds support for the `@override` directive on fields to indicate that a field should be moved from one subgraph to another. [PR #1484](https://github.com/apollographql/federation/pull/1484)

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
