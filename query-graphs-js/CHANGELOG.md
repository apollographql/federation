# CHANGELOG for `@apollo/query-graphs`

## 2.5.5
### Patch Changes

- Updated dependencies []:
  - @apollo/federation-internals@2.5.5

## 2.5.4
### Patch Changes

- Updated dependencies []:
  - @apollo/federation-internals@2.5.4

## 2.5.3
### Patch Changes


- More aggressive ignoring of indirect paths from root types when a more direct alternative exists. This optimisation ([#2669](https://github.com/apollographql/federation/pull/2669))
  slightly generalize an existing heuristic of the query planner, allowing it to ignore some known inefficient options
  earlier in its process. When this optimisation can be used, this yield faster query plan computation, but by reducing
  the number of plans to be consider, this can sometimes prevent the planner to degrade it's output when it consider
  there is too many plans to consider, which can result in more optimal query plans too.
- Updated dependencies [[`4b9a512b`](https://github.com/apollographql/federation/commit/4b9a512b62e02544d7854fa198942aac33b93feb), [`c6e0e76d`](https://github.com/apollographql/federation/commit/c6e0e76dbc62662c2aa6ff7f657e374047b11255), [`1add932c`](https://github.com/apollographql/federation/commit/1add932c5cd1297853fb5af9a3a6aaa71243f63a)]:
  - @apollo/federation-internals@2.5.3

## 2.5.2
### Patch Changes

- Updated dependencies [[`35179f08`](https://github.com/apollographql/federation/commit/35179f086ce973e9ae7bb455f7ea7d73cdc10f69)]:
  - @apollo/federation-internals@2.5.2

## 2.5.1
### Patch Changes

- Updated dependencies [[`b9052fdd`](https://github.com/apollographql/federation/commit/b9052fddfcd2cae1ea750aaea27f0a0b24f4e691)]:
  - @apollo/federation-internals@2.5.1

## 2.5.0
### Minor Changes


- Do not run the full suite of graphQL validations on supergraphs and their extracted subgraphs by default in production environment. ([#2657](https://github.com/apollographql/federation/pull/2657))
  
  Running those validations on every updates of the schema takes a non-negligible amount of time (especially on large
  schema) and mainly only serves in catching bugs early in the supergraph handling code, and in some limited cases,
  provide slightly better messages when a corrupted supergraph is received, neither of which is worth the cost in
  production environment.
  
  A new `validateSupergraph` option is also introduced in the gateway configuration to force this behaviour.

### Patch Changes

- Updated dependencies [[`fe1e3d7b`](https://github.com/apollographql/federation/commit/fe1e3d7b13ed76ac81e8fd6d911f4497995c59aa), [`6b18af50`](https://github.com/apollographql/federation/commit/6b18af50910872049938386b82ad40703d934f68), [`9396c0d6`](https://github.com/apollographql/federation/commit/9396c0d686092c06fa89f8512378610bfe4154cc), [`2b5796a9`](https://github.com/apollographql/federation/commit/2b5796a962b3478961f9486c28f5cfd161fafbb0), [`4f3c3b9e`](https://github.com/apollographql/federation/commit/4f3c3b9eedb5dacb6dee29aa21bb74cdd1244732)]:
  - @apollo/federation-internals@2.5.0

## 2.4.10
### Patch Changes

- Updated dependencies [[`b6be9f96`](https://github.com/apollographql/federation/commit/b6be9f9650a69f6214d806d66b198729560da3dc)]:
  - @apollo/federation-internals@2.4.10

## 2.4.9
### Patch Changes


- Improves query planning time in some situations where entities use multiple keys. ([#2610](https://github.com/apollographql/federation/pull/2610))

- Updated dependencies [[`7ac83456`](https://github.com/apollographql/federation/commit/7ac834568d57a9b9e63002353543d32f6e97b4a5), [`d60349b3`](https://github.com/apollographql/federation/commit/d60349b3fa7e5ba1f64c1727d88dc6faec21a38a), [`1bb7c512`](https://github.com/apollographql/federation/commit/1bb7c5129c7b07627ea33684b538fda8a83b8da8), [`02eab3ac`](https://github.com/apollographql/federation/commit/02eab3ac4a0514bef8f9253a9e43418ba1c17843), [`fd4545c2`](https://github.com/apollographql/federation/commit/fd4545c27ef343ad14436f9541f539ef80bacafa)]:
  - @apollo/federation-internals@2.4.9

## 2.4.8
### Patch Changes


- Fix query planner heuristic that could lead to ignoring some valid option and yielding a non-optimal query plan. ([#2623](https://github.com/apollographql/federation/pull/2623))

- Updated dependencies [[`62e0d254`](https://github.com/apollographql/federation/commit/62e0d254f92a6a259032cda5e1ce810ae6478022), [`7f1ef73e`](https://github.com/apollographql/federation/commit/7f1ef73ee00b82c9b4b1bbfd23f3be10e3a1e176)]:
  - @apollo/federation-internals@2.4.8

## 2.4.7
### Patch Changes

- Updated dependencies [[`2d44f346`](https://github.com/apollographql/federation/commit/2d44f346c553f489d83f1c672e1ad8715665cde2)]:
  - @apollo/federation-internals@2.4.7

## 2.4.6
### Patch Changes

- Updated dependencies [[`5cd17e69`](https://github.com/apollographql/federation/commit/5cd17e6965664768c9d9f5b734634764bbebf2e7), [`e136ad87`](https://github.com/apollographql/federation/commit/e136ad87db6005ddd8100f98022a043c0846f38e)]:
  - @apollo/federation-internals@2.4.6

## 2.4.5
### Patch Changes


- Supersedes v2.4.4 due to a publishing error with no dist/ folder ([#2583](https://github.com/apollographql/federation/pull/2583))

- Updated dependencies [[`c96e24c4`](https://github.com/apollographql/federation/commit/c96e24c448bde3c4acfa5332335e868c701d7621)]:
  - @apollo/federation-internals@2.4.5

## 2.4.4
### Patch Changes

- Updated dependencies []:
  - @apollo/federation-internals@2.4.4

## 2.4.3
### Patch Changes

- Updated dependencies [[`f6a8c1ce`](https://github.com/apollographql/federation/commit/f6a8c1cee60dc2b602db857b610fe8280674f2ee)]:
  - @apollo/federation-internals@2.4.3

## 2.4.2
### Patch Changes

- Updated dependencies [[`2c370508`](https://github.com/apollographql/federation/commit/2c3705087284710956390c7c3444c812db7c22e0), [`179b4602`](https://github.com/apollographql/federation/commit/179b46028b914ef743674a5c59e0f3a6edc31638)]:
  - @apollo/federation-internals@2.4.2

## 2.4.1
### Patch Changes


- Fix issues (incorrectly rejected composition and/or subgraph errors) with `@interfaceObject`. Those issues may occur ([#2494](https://github.com/apollographql/federation/pull/2494))
  either due to some use of `@requires` in an `@interfaceObject` type, or when some subgraph `S` defines a type that is an
  implementation of an interface `I` in the supergraph, and there is an `@interfaceObject` for `I` in another subgraph,
  but `S` does not itself defines `I`.

- Start building packages with TS 5.x, which should have no effect on consumers ([#2480](https://github.com/apollographql/federation/pull/2480))

- Updated dependencies [[`450b9578`](https://github.com/apollographql/federation/commit/450b9578ec8d66a48621f0e76fe0b4f738a78659), [`afde3158`](https://github.com/apollographql/federation/commit/afde3158ec2ee93b123a9bdb0f1a852e41fa7f27), [`eafebc3c`](https://github.com/apollographql/federation/commit/eafebc3c9af5c511990fe66b7c2900ba9a1b330f), [`01fe3f83`](https://github.com/apollographql/federation/commit/01fe3f836c08805c1c53b14c745a5117c678866d)]:
  - @apollo/federation-internals@2.4.1

## 2.4.0
### Patch Changes


- Refactor the internal implementation of selection sets used by the query planner to decrease the code complexity and ([#2387](https://github.com/apollographql/federation/pull/2387))
  improve query plan generation performance in many cases.

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
