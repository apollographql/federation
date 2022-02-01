# CHANGELOG for `@apollo/subgraph`

## vNEXT

> The changes noted within this `vNEXT` section have not been released yet.  New PRs and commits which introduce changes should include an entry in this `vNEXT` section as part of their development.  When a release is being prepared, a new header will be (manually) created below and the appropriate changes within that release will be moved into the new section.

- Print description text for the `schema` definition node, as allowed per the October 2021 edition of the GraphQL specification [PR #1442](https://github.com/apollographql/federation/pull/1442).
- Make sure scalars don't print a `specifiedBy` directive unless specified in the subgraph. [PR #1465](https://github.com/apollographql/federation/pull/1465)

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

