# CHANGELOG for `@apollo/query-graphs`

## 2.4.0-alpha.0
### Patch Changes

- Updated dependencies [[`6e2d24b5`](https://github.com/apollographql/federation/commit/6e2d24b5491914316b9930395817f0c3780f181a), [`1a555d98`](https://github.com/apollographql/federation/commit/1a555d98f2030814ebd5074269d035b7f298f71e)]:
  - @apollo/federation-internals@2.4.0-alpha.0

## 2.3.3
### Patch Changes


- Update ts-graphviz dependency ([#2395](https://github.com/apollographql/federation/pull/2395))

- Updated dependencies []:
  - @apollo/federation-internals@2.3.3

## 2.3.2
### Patch Changes

- Updated dependencies []:
  - @apollo/federation-internals@2.3.2

## 2.3.1
### Patch Changes


- Fix assertion errors thrown by the query planner when querying fields for a specific interface implementation in some cases where `@interfaceObject` is involved ([#2362](https://github.com/apollographql/federation/pull/2362))

- Updated dependencies []:
  - @apollo/federation-internals@2.3.1

## 2.2.0

- Drop support for node12 [PR #2202](https://github.com/apollographql/federation/pull/2202)

## 2.1.0

- Fix abnormally high memory usage when extracting subgraphs for some fed1 supergraphs (and small other memory footprint improvements) [PR #2089](https://github.com/apollographql/federation/pull/2089).
- Fix issue when type is only reachable through a @provides [PR #2083](https://github.com/apollographql/federation/pull/2083).
- Update peer dependency `graphql` to `^16.5.0` to use `GraphQLErrorOptions` [PR #2060](https://github.com/apollographql/federation/pull/2060)
- Add `@defer` support [PR #1958](https://github.com/apollographql/federation/pull/1958)
- Fix issue generating plan for a "diamond-shaped" dependency [PR #1900](https://github.com/apollographql/federation/pull/1900)
- Avoid type-explosion with fed1 supergraphs using a fed2 query planner [PR #1994](https://github.com/apollographql/federation/pull/1994).
- Expand support for Node.js v18 [PR #1884](https://github.com/apollographql/federation/pull/1884)

## 2.0.5

- Fix bug with unsatisfiable query branch when handling federation 1 supergraph [PR #1908](https://github.com/apollographql/federation/pull/1908).

## 2.0.2

- Fix bug where planning a query with `@require` impacts the plans of followup queries [PR #1783](https://github.com/apollographql/federation/pull/1783).

## v2.0.1

- Released in sync with other federation packages but no changes to this package.

## v2.0.0

- Previous preview release promoted to general availability! Please see previous changelog entries for full info.

## v2.0.0-preview.9

- Support for Node 17 [PR #1541](https://github.com/apollographql/federation/pull/1541).

## v2.0.0-preview.2

- Re-publishing release which published to npm with stale build artifacts from `version-0.x` release.

## v2.0.0-preview.1

- No-op publish to account for publishing difficulties.

## v2.0.0-preview.0

- Initial "preview" release.

## v2.0.0-alpha.6

- No direct changes, only transitive updates to `@apollo/federation-internals`.

## v2.0.0-alpha.5

- Remove `graphql@15` from peer dependencies [PR #1472](https://github.com/apollographql/federation/pull/1472).

## v2.0.0-alpha.4

- Add missing `deep-equal` dependency [PR #1391](https://github.com/apollographql/federation/pull/1391)

## v2.0.0-alpha.3

- Fix issue with nested `@requires` directives [PR #1306](https://github.com/apollographql/federation/pull/1306).

## v2.0.0-alpha.2

- __BREAKING__: Bump graphql peer dependency to `^15.7.0` [PR #1200](https://github.com/apollographql/federation/pull/1200)
- Fix the handling of nested `@provides` directives [PR #1148](https://github.com/apollographql/federation/pull/1148).

## v2.0.0-alpha.1

- :tada: Initial alpha release of Federation 2.0.  For more information, see our [documentation](https://www.apollographql.com/docs/federation/v2/).  We look forward to your feedback!
