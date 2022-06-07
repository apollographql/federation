# Changelog

All notable changes to Federation will be documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

# [2.0.5] - 2022-06-07

## 🐛 Fixes

- Fix bug with unsatisfiable query branch when handling federation 1 supergraph [PR #1908](https://github.com/apollographql/federation/pull/1908).

## 📚 Documentation

- Update docs to explain how composition merges types under the hood (union and intersection) [PR #1839](https://github.com/apollographql/federation/pull/1839).
- Update `@override` docs with multiple usage note [PR #1871](https://github.com/apollographql/federation/pull/1871).
- Update AWS subgraph compatibility test results [PR #1901](https://github.com/apollographql/federation/pull/1901).

# [2.0.4] - 2022-06-01

## 🐛 Fixes

- Fix issue when all root operations were defined in an `extend schema` [PR #1875](https://github.com/apollographql/federation/issues/1875).

# [2.0.3] - 2022-05-20

## 🐛 Fixes

- Fix bug with type extension of empty type definition [PR #1821](https://github.com/apollographql/federation/pull/1821)
- Fix output of `printSubgraphSchema` method, ensuring it can be read back by composition and `buildSubgraphSchema` [PR #1831](https://github.com/apollographql/federation/pull/1831).
- Fix issue with `@requires` and conditional queries (`@include`/`@skip`) [1835](https://github.com/apollographql/federation/pull/1835).
- Fix bug with field covariance when the underlying plan use type-explosion [1859](https://github.com/apollographql/federation/pull/1859).
- Fix definition of `@key` to be repeatable [PR #1826](https://github.com/apollographql/federation/pull/1826).

## 📚 Documentation

- Split up subgraph table for TOC [PR #1850](https://github.com/apollographql/federation/pull/1850)
- Schema checks are now free (https://github.com/apollographql/federation/pull/1870)
- Explicitly document disabling CORS (https://github.com/apollographql/federation/pull/1833)
- Update federation2 compatibility table (https://github.com/apollographql/federation/pull/1806)


# [2.0.2] - 2022-05-03

## ❗ IMPORTANT NOTES ❗

- The `fetch` implementation used by default by `UplinkFetcher` and `RemoteGraphQLDataSource` is now imported from `make-fetch-happen` v10 instead of v8. We don't believe this should cause any compatibility issues but please file an issue if this created any unintentional problems.
- `v2.0.0` accidentally added a limit of 15 simultaneous requests per subgraph; that has been removed. Please accept this new release as our penance.
- We no longer export a `getDefaultFetcher` function. If you were using this function, you can replace `const fetcher = getDefaultFetcher()` with `import fetcher from 'make-fetch-happen'`.

## 🚀 Features

- Improve fed1 schema support during composition [PR #1735](https://github.com/apollographql/federation/pull/1735)
- Add gateway version to schema extensions [PR #1751](https://github.com/apollographql/federation/pull/1751)
- More helpful error message for errors encountered while reading supergraphs generated pre-federation 2 [PR #1796](https://github.com/apollographql/federation/pull/1796)
- Upgrade to `make-fetch-happen` v10, to allow more concurrency and many other improvements [PR #1805](https://github.com/apollographql/federation/pull/1805)

## 🐛 Fixes

- Improve merging of groups during `@require` handling in query planning [PR #1732](https://github.com/apollographql/federation/pull/1732)
- Move `__resolveReference` resolvers on to `extensions` [PR #1746](https://github.com/apollographql/federation/pull/1746)
- Honor directive imports when directive name is spec name [PR #1720](https://github.com/apollographql/federation/pull/1720)
- Fix `Schema.clone` when directive application happens before definition [PR #1785](https://github.com/apollographql/federation/pull/1785)
- Fix handling of @require "chains" (a @require whose fields have @require themselves) [PR #1790](https://github.com/apollographql/federation/pull/1790)
- Fix bug applying an imported federation directive on another directive definition [PR #1797](https://github.com/apollographql/federation/pull/1797).
- Fix bug where planning a query with `@require` impacts the plans of followup queries [PR #1783](https://github.com/apollographql/federation/pull/1783).
- Add __resolveType to _Entity union [PR #1773](https://github.com/apollographql/federation/pull/1773)
- Fix bug removing an enum type [PR #1813](https://github.com/apollographql/federation/pull/1813)

## 🛠 Maintenance

- Improved renovate bot auto-updates for 0.x packages [PR #1736](https://github.com/apollographql/federation/pull/1736) and [PR #1730](https://github.com/apollographql/federation/pull/1730)
- Add missing `@apollo/federation-internals` dependency to gateway [PR #1721](https://github.com/apollographql/federation/pull/1721)
- Migrate to `@apollo/utils` packages for `createSHA` and `isNodeLike` [PR #1765](https://github.com/apollographql/federation/pull/1765)
- The `fetch` implementation returned by `getDefaultFetcher` no longer performs in-memory caching [PR #1792](https://github.com/apollographql/federation/pull/1792)
- Prevent non-core-feature elements from being marked @inaccessible if referenced by core feature elements [PR #1769](https://github.com/apollographql/federation/pull/1769)

## 📚 Documentation

- Roadmap updates! [PR #1717](https://github.com/apollographql/federation/pull/1717)
- Clarify separation of concerns in the intro docs [PR #1753](https://github.com/apollographql/federation/pull/1753)
- Update intro example for fed2 [PR #1741](https://github.com/apollographql/federation/pull/1741)
- Improve error doc generation, add hints generation, add scrolling style to too-large error tables [PR #1740](https://github.com/apollographql/federation/pull/1740)
- Update `supergraphSDL` to be a string when creating an `ApolloGateway` [PR #1744](https://github.com/apollographql/federation/pull/1744)
- Federation subgraph library compatibility updates [PR #1718](https://github.com/apollographql/federation/pull/1744)
- Moved enterprise guide to root documentation repo [PR #1786](https://github.com/apollographql/federation/pull/1786)
- Various docs tidying and "supergraphification" [PR #1758](https://github.com/apollographql/federation/pull/1758)
- Moving to fed2 article improvements [PR #1802](https://github.com/apollographql/federation/pull/1802)

# [2.0.1] - 2022-04-12

## 🐛 Fixes

- Use `for: SECURITY` in the core/link directive application in the supergraph for `@inaccessible` [PR #1715](https://github.com/apollographql/federation/pull/1715)

## 🛠 Maintenance

- Update the `.idea` config [PR #1714](https://github.com/apollographql/federation/pull/1714)

## 📚 Documentation

- Major documentation update for fed2 [PR #1651](https://github.com/apollographql/federation/pull/1651)

- Fix broken links [PR #1711](https://github.com/apollographql/federation/pull/1711)

# [2.0.0] - 2022-04-11

## 🚀 Features

Official Federation 2.0 release!
