# CHANGELOG for `@apollo/subgraph`

## 2.4.4
### Patch Changes

- Updated dependencies []:
  - @apollo/federation-internals@2.4.4

## 2.4.3
### Patch Changes


- Resolve `Promise` references before calling `__resolveType` on interface ([#2556](https://github.com/apollographql/federation/pull/2556))
  
  Since the introduction of entity interfaces, users could not return
  a `Promise` from `__resolveReference` while implementing a synchronous,
  custom `__resolveType` function. This change fixes/permits this use case.
  
  Additional background / implementation details:
  
  Returning a `Promise` from `__resolveReference` has historically never
  been an issue. However, with the introduction of entity interfaces, the
  calling of an interface's `__resolveType` function became a new concern.
  
  `__resolveType` functions expect a reference (and shouldn't be concerned
  with whether those references are wrapped in a `Promise`). In order to
  address this, we can `await` the reference before calling the
  `__resolveType` (this handles both the non-`Promise` and `Promise` case).
- Updated dependencies [[`f6a8c1ce`](https://github.com/apollographql/federation/commit/f6a8c1cee60dc2b602db857b610fe8280674f2ee)]:
  - @apollo/federation-internals@2.4.3

## 2.4.2
### Patch Changes

- Updated dependencies [[`2c370508`](https://github.com/apollographql/federation/commit/2c3705087284710956390c7c3444c812db7c22e0), [`179b4602`](https://github.com/apollographql/federation/commit/179b46028b914ef743674a5c59e0f3a6edc31638)]:
  - @apollo/federation-internals@2.4.2

## 2.4.1
### Patch Changes


- Start building packages with TS 5.x, which should have no effect on consumers ([#2480](https://github.com/apollographql/federation/pull/2480))

- Updated dependencies [[`450b9578`](https://github.com/apollographql/federation/commit/450b9578ec8d66a48621f0e76fe0b4f738a78659), [`afde3158`](https://github.com/apollographql/federation/commit/afde3158ec2ee93b123a9bdb0f1a852e41fa7f27), [`eafebc3c`](https://github.com/apollographql/federation/commit/eafebc3c9af5c511990fe66b7c2900ba9a1b330f), [`01fe3f83`](https://github.com/apollographql/federation/commit/01fe3f836c08805c1c53b14c745a5117c678866d)]:
  - @apollo/federation-internals@2.4.1

## 2.4.0
### Patch Changes


- Optimises query plan generation for parts of queries that can statically be known to not cross across subgraphs ([#2449](https://github.com/apollographql/federation/pull/2449))

- Updated dependencies [[`260c357c`](https://github.com/apollographql/federation/commit/260c357c10b4cf560c66d11f85552036c2638b0b), [`7bc0f8e8`](https://github.com/apollographql/federation/commit/7bc0f8e814ea003802ed3761b5eeeb7137650b0c), [`1a555d98`](https://github.com/apollographql/federation/commit/1a555d98f2030814ebd5074269d035b7f298f71e), [`cab383b2`](https://github.com/apollographql/federation/commit/cab383b22d37bb6bc687b4d8cec6f5c22245f41f)]:
  - @apollo/federation-internals@2.4.0

## 2.4.0-alpha.1
### Patch Changes

- Updated dependencies [[`7bc0f8e8`](https://github.com/apollographql/federation/commit/7bc0f8e814ea003802ed3761b5eeeb7137650b0c)]:
  - @apollo/federation-internals@2.4.0-alpha.1

## 2.4.0-alpha.0
### Patch Changes

- Updated dependencies [[`6e2d24b5`](https://github.com/apollographql/federation/commit/6e2d24b5491914316b9930395817f0c3780f181a), [`1a555d98`](https://github.com/apollographql/federation/commit/1a555d98f2030814ebd5074269d035b7f298f71e)]:
  - @apollo/federation-internals@2.4.0-alpha.0

## 2.3.5
### Patch Changes

- Updated dependencies []:
  - @apollo/federation-internals@2.3.5
  
## 2.3.4
### Patch Changes

- Updated dependencies [[`6e2d24b5`](https://github.com/apollographql/federation/commit/6e2d24b5491914316b9930395817f0c3780f181a)]:
  - @apollo/federation-internals@2.3.4

## 2.3.3
### Patch Changes


- Correctly attach provided subscription resolvers to the schema object ([#2388](https://github.com/apollographql/federation/pull/2388))

- Updated dependencies []:
  - @apollo/federation-internals@2.3.3

## 2.3.2
### Patch Changes

- Updated dependencies []:
  - @apollo/federation-internals@2.3.2

## 2.3.1
### Patch Changes

- Updated dependencies []:
  - @apollo/federation-internals@2.3.1

This CHANGELOG pertains only to Apollo Federation packages in the 2.x range. The Federation v0.x equivalent for this package can be found [here](https://github.com/apollographql/federation/blob/version-0.x/subgraph-js/CHANGELOG.md) on the `version-0.x` branch of this repo.

## 2.3.0-beta.2
- `@tag` directive support for the `SCHEMA` location. This has been added to the 2.3 version of the federation spec, so to access this functionality you must bump your federation spec version to 2.3 by using `@link(url: "https://specs.apollo.dev/federation/v2.3", ...)` on your `schema` element. [PR #2314](https://github.com/apollographql/federation/pull/2314).

## 2.3.0

- Adds support for the 2.3 version of the federation spec (that is, `@link(url: "https://specs.apollo.dev/federation/v2.3")`), with:
- New `@interfaceObject` directive and support for keys on interfaces.

## 2.2.0

- Adds support for the 2.2 version of the federation spec (that is, `@link(url: "https://specs.apollo.dev/federation/v2.2")`), which:
- allows `@shareable` to be repeatable so it can be allowed on both a type definition and its extensions [PR #2175](https://github.com/apollographql/federation/pull/2175).
- Drop support for node12 [PR #2202](https://github.com/apollographql/federation/pull/2202)

## 2.1.0

- Update peer dependency `graphql` to `^16.5.0` to use `GraphQLErrorOptions` [PR #2060](https://github.com/apollographql/federation/pull/2060)
-  Remove dependency on apollo-server-types [PR #2037](https://github.com/apollographql/federation/pull/2037)
- Expand support for Node.js v18 [PR #1884](https://github.com/apollographql/federation/pull/1884)

## 2.0.3

- Fix output of `printSubgraphSchema` method, ensuring it can be read back by composition and `buildSubgraphSchema` [PR #1831](https://github.com/apollographql/federation/pull/1831).
- Fix definition of `@key` to be repeatable [PR #1826](https://github.com/apollographql/federation/pull/1826).

## 2.0.2

- Add __resolveType to _Entity union [PR #1773](https://github.com/apollographql/federation/pull/1773)

## v2.0.1

- Released in sync with other federation packages but no changes to this package.

## v2.0.0

- Previous preview release promoted to general availability! Please see previous changelog entries for full info.

## v2.0.0-preview.14

- Implement `buildSubgraphSchema` using federation internals [PR #1697](https://github.com/apollographql/federation/pull/1697)

## v2.0.0-preview.13

- Revert previous `@apollo/core-schema` update due to incopatibilities with some existing schemas [PR #1704](https://github.com/apollographql/federation/pull/1704)

## v2.0.0-preview.12

- Generate a core schema in `buildSubgraphSchema`, incorporating the latest changes from `@apollo/core-schema` [PR #1554](https://github.com/apollographql/federation/pull/1554)

## v2.0.0-preview.9

- Adds Support for `@tag/v0.2`, which allows the `@tag` directive to be additionally placed on arguments, scalars, enums, enum values, input objects, and input object fields. [PR #1652](https://github.com/apollographql/federation/pull/1652).
- Adds support for the `@override` directive on fields to indicate that a field should be moved from one subgraph to another. [PR #1484](https://github.com/apollographql/federation/pull/1484)

## v2.0.0-preview.7

- Automatically add the `@tag` directive definition in `buildSubgraphSchema` (but still support it if the definition is present in the input document) [PR #1600](https://github.com/apollographql/federation/pull/1600).

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
