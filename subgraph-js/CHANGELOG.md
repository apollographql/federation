# CHANGELOG for `@apollo/subgraph`

This CHANGELOG pertains only to Apollo Federation packages in the 2.x range. The Federation v0.x equivalent for this package can be found [here](https://github.com/apollographql/federation/blob/version-0.x/subgraph-js/CHANGELOG.md) on the `version-0.x` branch of this repo.

## v2.0.0-preview.14

- Implement `buildSubgraphSchema` using federation internals [PR #1697](https://github.com/apollographql/federation/pull/1697)

## v2.0.0-preview.13

- Revert previous `@apollo/core-schema` update due to incopatibilities with some existing schemas [PR #1704](https://github.com/apollographql/federation/pull/1704)

## v2.0.0-preview.12

- Generate a core schema in `buildSubgraphSchema`, incorporating the latest changes from `@apollo/core-schema` [PR #1554](https://github.com/apollographql/federation/pull/1554)

## v2.0.0-preview.11

- Released in sync with other federation packages but no changes to this package.

## v2.0.0-preview.10

- Released in sync with other federation packages but no changes to this package.

## v2.0.0-preview.9

- Adds Support for `@tag/v0.2`, which allows the `@tag` directive to be additionally placed on arguments, scalars, enums, enum values, input objects, and input object fields. [PR #1652](https://github.com/apollographql/federation/pull/1652).
- Adds support for the `@override` directive on fields to indicate that a field should be moved from one subgraph to another. [PR #1484](https://github.com/apollographql/federation/pull/1484)

## v2.0.0-preview.8

- Released in sync with other federation packages but no changes to this package.

## v2.0.0-preview.7

- Automatically add the `@tag` directive definition in `buildSubgraphSchema` (but still support it if the definition is present in the input document) [PR #1600](https://github.com/apollographql/federation/pull/1600).

## v2.0.0-preview.6

- Released in sync with other federation packages but no changes to this package.

## v2.0.0-preview.5

- Released in sync with other federation packages but no changes to this package.

## v2.0.0-preview.4

- Released in sync with other federation packages but no changes to this package.

## v2.0.0-preview.3

- Released in sync with other federation packages but no changes to this package.

## v2.0.0-preview.2

- Re-publishing release which published to npm with stale build artifacts from `version-0.x` release.

## v2.0.0-preview.1

- No-op publish to account for publishing difficulties.

## v2.0.0-preview.0

- Initial "preview" release.

## v2.0.0-alpha.6

- No direct changes.  Just bumping to maintain version alignment with other v2.0.0 alpha packages.

## v2.0.0-alpha.5

- No direct changes.  Just bumping to maintain version alignment with other v2.0.0 alpha packages.

## v2.0.0-alpha.4

- Print description text for the `schema` definition node, as allowed per the October 2021 edition of the GraphQL specification [PR #1464](https://github.com/apollographql/federation/pull/1464).
- Make sure scalars don't print a `specifiedBy` directive unless specified in the subgraph. [PR #1463](https://github.com/apollographql/federation/pull/1463)
- Remove `graphql@15` from peer dependencies [PR #1472](https://github.com/apollographql/federation/pull/1472).

## v2.0.0-alpha.2

- __BREAKING__: Bump graphql peer dependency to `^15.7.0` [PR #1200](https://github.com/apollographql/federation/pull/1200)

## v2.0.0-alpha.1

- :tada: Initial alpha release of Federation 2.0.  For more information, see our [documentation](https://www.apollographql.com/d      ocs/federation/v2/).  We look forward to your feedback!
  > _Note!_ While packages like `@apollo/gateway` and `@apollo/query-planner` do have substantial changes in Federation 2, currently, there are no substantial changes to this package.  We anticipate that could change by the end of the v2 series.

## v0.1.3

- Updates to transitive dependencies.  No other substantial changes.

## v0.1.2

- Expose `printSubgraphSchema()` as a top-level export of the `@apollo/subgraph` package to maintain backwards compatibility with the `printSchema()` export from `@apollo/federation` [#1078](https://github.com/apollographql/federation/pull/1078)

## v0.1.1

- Correctly print `@tag` definitions and usages in subgraph SDL query [#1071](https://github.com/apollographql/federation/pull/1071)

## v0.1.0

- Initial release of new `@apollo/subgraph` package. This package is the subgraph-related slice of the `@apollo/federation` package which was previously responsible for both subgraph and composition bits. `@apollo/federation` users will experience no change in behavior for now, but our docs will suggest the usage of the `@apollo/subgraph` package going forward. For past iterations and CHANGELOG information of related work, see the [`@apollo/federation` CHANGELOG.md](../federation-js/CHANGELOG.md)[PR #1058](https://github.com/apollographql/federation/pull/1058)

