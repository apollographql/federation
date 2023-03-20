# CHANGELOG for `@apollo/composition`

## 2.4.0
### Minor Changes


- Addition of new query planner node types to enable federated subscriptions support ([#2389](https://github.com/apollographql/federation/pull/2389))


### Patch Changes


- Refactor the internal implementation of selection sets used by the query planner to decrease the code complexity and ([#2387](https://github.com/apollographql/federation/pull/2387))
  improve query plan generation performance in many cases.

- Optimises query plan generation for parts of queries that can statically be known to not cross across subgraphs ([#2449](https://github.com/apollographql/federation/pull/2449))

- Updated dependencies [[`260c357c`](https://github.com/apollographql/federation/commit/260c357c10b4cf560c66d11f85552036c2638b0b), [`7bc0f8e8`](https://github.com/apollographql/federation/commit/7bc0f8e814ea003802ed3761b5eeeb7137650b0c), [`1a555d98`](https://github.com/apollographql/federation/commit/1a555d98f2030814ebd5074269d035b7f298f71e), [`cab383b2`](https://github.com/apollographql/federation/commit/cab383b22d37bb6bc687b4d8cec6f5c22245f41f)]:
  - @apollo/federation-internals@2.4.0
  - @apollo/query-graphs@2.4.0

## 2.4.0-alpha.1
### Patch Changes

- Updated dependencies [[`7bc0f8e8`](https://github.com/apollographql/federation/commit/7bc0f8e814ea003802ed3761b5eeeb7137650b0c)]:
  - @apollo/federation-internals@2.4.0-alpha.1
  - @apollo/query-graphs@2.4.0-alpha.1

## 2.4.0-alpha.0
### Minor Changes


- Addition of new query planner node types to enable federated subscriptions support ([#2389](https://github.com/apollographql/federation/pull/2389))


### Patch Changes

- Updated dependencies [[`6e2d24b5`](https://github.com/apollographql/federation/commit/6e2d24b5491914316b9930395817f0c3780f181a), [`1a555d98`](https://github.com/apollographql/federation/commit/1a555d98f2030814ebd5074269d035b7f298f71e)]:
  - @apollo/federation-internals@2.4.0-alpha.0
  - @apollo/query-graphs@2.4.0-alpha.0

## 2.3.5
### Patch Changes

- Updated dependencies []:
  - @apollo/federation-internals@2.3.5
  - @apollo/query-graphs@2.3.5
  
## 2.3.4
### Patch Changes

- Updated dependencies [[`6e2d24b5`](https://github.com/apollographql/federation/commit/6e2d24b5491914316b9930395817f0c3780f181a)]:
  - @apollo/federation-internals@2.3.4
  - @apollo/query-graphs@2.3.4

## 2.3.3
### Patch Changes


- Stop generating misleading "hint" regarding value type fields for interface types that are entity interfaces (they have a `@key` defined). ([#2412](https://github.com/apollographql/federation/pull/2412))

- Updated dependencies [[`de89e504`](https://github.com/apollographql/federation/commit/de89e5044d1a2500505a9269bcec7709aa1dcdf4)]:
  - @apollo/query-graphs@2.3.3
  - @apollo/federation-internals@2.3.3

## 2.3.2
### Patch Changes

- Updated dependencies []:
  - @apollo/federation-internals@2.3.2
  - @apollo/query-graphs@2.3.2

## 2.3.1
### Patch Changes

- Updated dependencies [[`7e2ca46f`](https://github.com/apollographql/federation/commit/7e2ca46f57dccae6f5037c64d8719cee72adfe88)]:
  - @apollo/query-graphs@2.3.1
  - @apollo/federation-internals@2.3.1

This CHANGELOG pertains only to Apollo Federation packages in the 2.x range. The Federation v0.x equivalent for this package can be found [here](https://github.com/apollographql/federation/blob/version-0.x/federation-js/CHANGELOG.md) on the `version-0.x` branch of this repo.

## 2.3.0-beta.2
- Error on composition when a `@shareable` field runtime types don't intersect between subgraphs: a `@shareable` field
  must resolve the same way in all the subgraphs, but this is impossible if the concrete runtime types have no
  intersection at all [PR #1556](https://github.com/apollographql/federation/pull/1556). 
- Uses the 0.3 version of the tag spec in the supergraph, which adds `@tag` directive support for the `SCHEMA` location [PR #2314](https://github.com/apollographql/federation/pull/2314).
- Fixes composition issues with `@interfaceObject` [PR #2318](https://github.com/apollographql/federation/pull/2318).

## 2.3.0-alpha.0

- Preserves source of union members and enum values in supergraph [PR #2288](https://github.com/apollographql/federation/pull/2288).
- __BREAKING__: composition now rejects `@override` on interface fields. The `@override` directive was not
  meant to be supported on interfaces and was not having any impact whatsoever. If an existing subgraph does have a
  `@override` on an interface field, this will now be rejected, but the `@override` can simply and safely be removed
  since it previously was ignored.

## 2.2.0

- __BREAKING__: composition now rejects `@shareable` on interface fields. The `@shareable` directive is about
  controlling if multiple subgraphs can resolve a particular field, and as interface field are never directly resolved
  (it's their implementation that are), having `@shareable` on interface fields is not completely meaningful and
  was never meant to be supported. If an existing subgraph does have a `@shareable` on an interface field, this
  will now be rejected, but the `@shareable` can simply and safely be removed since it previously was ignored.
- Provide support for marking @external on object type [PR #2214](https://github.com/apollographql/federation/pull/2214)
- Drop support for node12 [PR #2202](https://github.com/apollographql/federation/pull/2202)
- Fix error when a skipped enum value had directives applied [PR #2232](https://github.com/apollographql/federation/pull/2232).

## 2.1.4

- Improves error message to help with misspelled source of an `@override` [PR #2181](https://github.com/apollographql/federation/pull/2181).

## 2.1.2

- Fix composition of repeatable custom directives [PR #2136](https://github.com/apollographql/federation/pull/2136)
- Allow fields with arguments in `@requires` [PR #2120](https://github.com/apollographql/federation/pull/2120).

## 2.1.0

- Don't apply @shareable when upgrading fed1 supergraphs if it's already @shareable [PR #2043](https://github.com/apollographql/federation/pull/2043)
- Update peer dependency `graphql` to `^16.5.0` to use `GraphQLErrorOptions` [PR #2060](https://github.com/apollographql/federation/pull/2060)
- Don't require `@link` when using `@composeDirective` [PR #2046](https://github.com/apollographql/federation/pull/2046)
- Add `@composeDirective` directive to specify directives that should be merged to the supergraph during composition [PR #1996](https://github.com/apollographql/federation/pull/1996).
- Warn on merging inconsistent non-repeatable directive applications instead of failing composition [PR #1840](https://github.com/apollographql/federation/pull/1840).
- Expand support for Node.js v18 [PR #1884](https://github.com/apollographql/federation/pull/1884)

## v2.0.1

- Use `for: SECURITY` in the core/link directive application in the supergraph for `@inaccessible` [PR #1715](https://github.com/apollographql/federation/pull/1715)

## v2.0.0

- Previous preview release promoted to general availability! Please see previous changelog entries for full info.

## v2.0.0-preview.11

- Add a level to hints, uppercase their code and related fixes [PR #1683](https://github.com/apollographql/federation/pull/1683).
- Add support for `@inaccessible` v0.2 [PR #1678](https://github.com/apollographql/federation/pull/1678)

## v2.0.0-preview.10

- Fix merging of Input objects and enum types [PR #1672](https://github.com/apollographql/federation/pull/1672).
- Fix regression in composition validation introduced by #1653 [PR #1673](https://github.com/apollographql/federation/pull/1673).
- Add nodes when displaying hints for `@override` [PR #1684](https://github.com/apollographql/federation/pull/1684)

## v2.0.0-preview.9

- Fix handling of core/link when definitions are provided or partially so [PR #1662](https://github.com/apollographql/federation/pull/1662).
- Optimize composition validation when many entities spans many subgraphs [PR #1653](https://github.com/apollographql/federation/pull/1653).
- Support for Node 17 [PR #1541](https://github.com/apollographql/federation/pull/1541).
- Adds Support for `@tag/v0.2`, which allows the `@tag` directive to be additionally placed on arguments, scalars, enums, enum values, input objects, and input object fields. [PR #1652](https://github.com/apollographql/federation/pull/1652).
- Adds support for the `@override` directive on fields to indicate that a field should be moved from one subgraph to another. [PR #1484](https://github.com/apollographql/federation/pull/1484)

## v2.0.0-preview.8

NOTE: Be sure to upgrade the gateway _before_ re-composing/deploying with this version. See below and the changelog for `@apollo/gateway`.

- Adds support for `@inaccessible` in subgraphs [PR #1638](https://github.com/apollographql/federation/pull/1638).
- Fix merging of `@tag` directive when it is renamed in subgraphs [PR #1637](https://github.com/apollographql/federation/pull/1637).
- Generates supergraphs with `@link` instead of `@core`. As a result, prior federation 2 pre-release gateway will not read supergraphs generated by this version correctly, so you should upgrade the gateway to this version _before_ re-composing/deploying with this version.  [PR #1628](https://github.com/apollographql/federation/pull/1628).

## v2.0.0-preview.5

- Fix propagation of `@tag` to the supergraph and allows @tag to be repeated. Additionally, merged directives (only `@tag` and `@deprecated` currently) are not allowed on external fields anymore [PR #1592](https://github.com/apollographql/federation/pull/1592).

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

- No direct changes, only transitive updates to `@apollo/query-graphs` and `@apollo/federation-internals`.

## v2.0.0-alpha.5

- Remove `graphql@15` from peer dependencies [PR #1472](https://github.com/apollographql/federation/pull/1472).

## v2.0.0-alpha.3

- Assign and document error codes for all errors [PR #1274](https://github.com/apollographql/federation/pull/1274).

## v2.0.0-alpha.2

- __BREAKING__: Bump graphql peer dependency to `^15.7.0` [PR #1200](https://github.com/apollographql/federation/pull/1200)
- Add missing dependency to `@apollo/query-graphs`

## v2.0.0-alpha.1

- :tada: Initial alpha release of Federation 2.0.  For more information, see our [documentation](https://www.apollographql.com/docs/federation/v2/).  We look forward to your feedback!
