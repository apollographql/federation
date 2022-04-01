# CHANGELOG for `@apollo/federation-internals`

## vNEXT

> The changes noted within this `vNEXT` section have not been released yet.  New PRs and commits which introduce changes should include an entry in this `vNEXT` section as part of their development.  When a release is being prepared, a new header will be (manually) created below and the appropriate changes within that release will be moved into the new section.
- Adds Support for `@tag/v0.2`, which allows the `@tag` directive to be additionally placed on arguments, scalars, enums, enum values, input objects, and input object fields. [PR #1652](https://github.com/apollographql/federation/pull/1652).
- Add missing `includeDeprecated` argument for `args` and `inputFields` when defining introspection fields [PR #1584](https://github.com/apollographql/federation/pull/1584)
- Adds support for the `@override` directive on fields to indicate that a field should be moved from one subgraph to another. [PR #1484](https://github.com/apollographql/federation/pull/1484)

## v2.0.0-preview.8

- Released in sync with other federation packages but no changes to this package.

## v2.0.0-preview.7

- Released in sync with other federation packages but no changes to this package.

## v2.0.0-preview.6

- Released in sync with other federation packages but no changes to this package.

## v2.0.0-preview.5

- Fix propagation of `@tag` to the supergraph and allows @tag to be repeated. Additionally, merged directives (only `@tag` and `@deprecated` currently) are not allowed on external fields anymore [PR #1592](https://github.com/apollographql/federation/pull/1592).

## v2.0.0-preview.4

- Make error messages more actionable when constructing subgraphs from a supergraph [PR #1586](https://github.com/apollographql/federation/pull/1586)

## v2.0.0-preview.3

- Fix issue that created type extensions with descriptions, which is invalid graphQL syntax [PR #1582](https://github.com/apollographql/federation/pull/1582).

## v2.0.0-preview.2

- Re-publishing release which published to npm with stale build artifacts from `version-0.x` release.

## v2.0.0-preview.1

- No-op publish to account for publishing difficulties.

## v2.0.0-preview.0

- Initial "preview" release.

## v2.0.0-alpha.6

- Avoid incomplete subgraphs when extracting them from the supergraph. [PR #1511](https://github.com/apollographql/federation/pull/1511)

## v2.0.0-alpha.5

- Remove `graphql@15` from peer dependencies [PR #1472](https://github.com/apollographql/federation/pull/1472).

## v2.0.0-alpha.3

- Assign and document error codes for all errors [PR #1274](https://github.com/apollographql/federation/pull/1274).
- Fix issue reading some 0.x generated supergraphs [PR #1351](https://github.com/apollographql/federation/pull/1351).

## v2.0.0-alpha.2

- __BREAKING__: Bump graphql peer dependency to `^15.7.0` [PR #1200](https://github.com/apollographql/federation/pull/1200)

## v2.0.0-alpha.1

- :tada: Initial alpha release of Federation 2.0.  For more information, see our [documentation](https://www.apollographql.com/docs/federation/v2/).  We look forward to your feedback!
