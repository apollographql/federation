# CHANGELOG for `@apollo/subgraph`

This CHANGELOG pertains only to Apollo Federation packages in the `0.x` range. The Federation v2 equivalent for this package can be found [here](https://github.com/apollographql/federation/blob/main/subgraph-js/CHANGELOG.md) on the `main` branch of this repo.

## vNEXT

## v0.6.0

- Expand support for Node.js v18 [PR #1884](https://github.com/apollographql/federation/pull/1884)

## v0.4.2

- Add __resolveType to _Entity union [PR #1778](https://github.com/apollographql/federation/pull/1778)

## v0.4.0

- Support for Node 17 [PR #1648](https://github.com/apollographql/federation/pull/1648).

## v0.3.3

- Transitive dependency updates with no other notable changes.

## v0.3.1

- Improve typings for `GraphQLResolverMap` which previously prevented users from typing their `args` parameter on a resolver correctly. [PR #1499](https://github.com/apollographql/federation/pull/1499)

## v0.3.0

- __BREAKING__ Bump graphql@15 peer to ^15.8.0. Fix TS errors related to adding support for graphql@16 [PR #1482](https://github.com/apollographql/federation/pull/1482).

## v0.2.0

- Print description text for the `schema` definition node, as allowed per the October 2021 edition of the GraphQL specification [PR #1442](https://github.com/apollographql/federation/pull/1442).
- Make sure scalars don't print a `specifiedBy` directive unless specified in the subgraph. [PR #1465](https://github.com/apollographql/federation/pull/1465)
- Expand graphql peer dependency to include `^16.0.0` [PR #1428](https://github.com/apollographql/federation/pull/1428).

## v0.1.5

- Print `@contact` directive in `printSubgraphSchema` [PR #1096](https://github.com/apollographql/federation/pull/1096)

## v0.1.3

- Updates to transitive dependencies.  No other substantial changes.

## v0.1.2

- Expose `printSubgraphSchema()` as a top-level export of the `@apollo/subgraph` package to maintain backwards compatibility with the `printSchema()` export from `@apollo/federation` [#1078](https://github.com/apollographql/federation/pull/1078)

## v0.1.1

- Correctly print `@tag` definitions and usages in subgraph SDL query [#1071](https://github.com/apollographql/federation/pull/1071)

## v0.1.0

- Initial release of new `@apollo/subgraph` package. This package is the subgraph-related slice of the `@apollo/federation` package which was previously responsible for both subgraph and composition bits. `@apollo/federation` users will experience no change in behavior for now, but our docs will suggest the usage of the `@apollo/subgraph` package going forward. For past iterations and CHANGELOG information of related work, see the [`@apollo/federation` CHANGELOG.md](../federation-js/CHANGELOG.md)[PR #1058](https://github.com/apollographql/federation/pull/1058)

