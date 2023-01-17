# CHANGELOG for `@apollo/gateway`

This CHANGELOG pertains only to Apollo Federation packages in the 2.x range. The Federation v0.x equivalent for this package can be found [here](https://github.com/apollographql/federation/blob/version-0.x/gateway-js/CHANGELOG.md) on the `version-0.x` branch of this repo.

## vNext

## 2.3.0

- Adds support for `@interfaceObject` and keys on interfaces [PR #2279](https://github.com/apollographql/federation/pull/2279).
- Preserves source of union members and enum values in supergraph [PR #2288](https://github.com/apollographql/federation/pull/2288).
- Fix possible assertion error during query planning [PR #2299](https://github.com/apollographql/federation/pull/2299).
- __BREAKING__: composition now rejects `@override` on interface fields. The `@override` directive was not
  meant to be supported on interfaces and was not having any impact whatsoever. If an existing subgraph does have a
  `@override` on an interface field, this will now be rejected, but the `@override` can simply and safely be removed
  since it previously was ignored.
- Error on composition when a `@shareable` field runtime types don't intersect between subgraphs: a `@shareable` field
  must resolve the same way in all the subgraphs, but this is impossible if the concrete runtime types have no
  intersection at all [PR #1556](https://github.com/apollographql/federation/pull/1556). 
- Adds support for the 0.3 version of the tag spec, which adds `@tag` directive support for the `SCHEMA` location [PR #2314](https://github.com/apollographql/federation/pull/2314).
- Fix potential issue with nested `@defer` in non-deferrable case [PR #2312](https://github.com/apollographql/federation/pull/2312).
- Fixes composition issues with `@interfaceObject` [PR #2318](https://github.com/apollographql/federation/pull/2318).
- Improves generation of plans once all path options are computed [PR #2316](https://github.com/apollographql/federation/pull/2316).
- Generates correct response error paths for errors thrown during entity fetches [PR #2304](https://github.com/apollographql/federation/pull/2304).

## 2.2.2

- Fix issue with path in query plan's deferred nodes [PR #2281](https://github.com/apollographql/federation/pull/2281).

## 2.2.1

- Fix federation spec always being expanded to the last version [PR #2274](https://github.com/apollographql/federation/pull/2274).

## 2.2.0

- __BREAKING__: Disable exposing full document to sub-query by default (introduced 2.1.0):
  - This change decreases memory consumption in general (which is the reason for disabling this by
    default), but users that have custom code making use of `GraphQLDataSourceProcessOptions.document`
    will now need to explicitly set `GatewayConfig.queryPlannerConfig.exposeDocumentNodeInFetchNode`.
- __BREAKING__: composition now rejects `@shareable` on interface fields. The `@shareable` directive is about
  controlling if multiple subgraphs can resolve a particular field, and as interface field are never directly resolved
  (it's their implementation that are), having `@shareable` on interface fields is not completely meaningful and
  was never meant to be supported. If an existing subgraph does have a `@shareable` on an interface field, this
  will now be rejected, but the `@shareable` can simply and safely be removed since it previously was ignored.
- Allows `@shareable` to be repeatable so it can be allowed on both a type definition and its extensions [PR #2175](https://github.com/apollographql/federation/pull/2175).
  - Note that this require the use of the new 2.2 version of the federation spec introduced in this change.
- Preserve default values of input object fields [PR #2218](https://github.com/apollographql/federation/pull/2218).
- Drop support for node12 [PR #2202](https://github.com/apollographql/federation/pull/2202)
- Fix issue where QP was generating invalid plan missing some data [#361](https://github.com/apollographql/federation/issues/361).
- Avoid reusing named fragments that are invalid for the subgraph [PR #2255](https://github.com/apollographql/federation/pull/2255).
- Fix QP not always type-exploding interface when necessary [PR #2246](https://github.com/apollographql/federation/pull/2246).
- Fix potential QP issue with shareable root fields [PR #2239](https://github.com/apollographql/federation/pull/2239).
- Correctly reject field names starting with `__` [PR #2237](https://github.com/apollographql/federation/pull/2237).
- Fix error when a skipped enum value had directives applied [PR #2232](https://github.com/apollographql/federation/pull/2232).
- Preserve default values of input object fields [PR #2218](https://github.com/apollographql/federation/pull/2218).

## 2.1.4

- Ensures supergraph `@defer`/`@stream` definitions of supergraph are not included in the API schema [PR #2212](https://github.com/apollographql/federation/pull/2212).
- Optimize plan for defer where only keys are fetched [PR #2182](https://github.com/apollographql/federation/pull/2182).
- Improves error message to help with misspelled source of an `@override` [PR #2181](https://github.com/apollographql/federation/pull/2181).
- Fix validation of variable on input field not taking default into account [PR #2176](https://github.com/apollographql/federation/pull/2176).

## 2.1.3

- Fix building subgraph selections using the wrong underlying schema [PR #2155](https://github.com/apollographql/federation/pull/2155).

## 2.1.2

- Allow fields with arguments in `@requires` [PR #2120](https://github.com/apollographql/federation/pull/2120).
- Fix potential inefficient planning due to `__typename` [PR #2137](https://github.com/apollographql/federation/pull/2137).
- Fix potential assertion during query planning [PR #2133](https://github.com/apollographql/federation/pull/2133).
- Fix some defer query plans having invalid result sets (with empty branches) [PR #2125](https://github.com/apollographql/federation/pull/2125). 
- Fix defer information lost when cloning fetch group (resulting in non-deferred parts) [PR #2129](https://github.com/apollographql/federation/pull/2129).
- Fix directives on fragment spread being lost [PR #2126](https://github.com/apollographql/federation/pull/2126).

## 2.1.1

- Fix build-time regression caused by #1970 (removal of @types/node-fetch from runtime dependencies) [PR #2116](https://github.com/apollographql/federation/pull/2116)

## 2.1.0

- Fix issue where fragment expansion can erase applied directives (most notably `@defer`) [PR #2093](https://github.com/apollographql/federation/pull/2093).
- Fix abnormally high memory usage when extracting subgraphs for some fed1 supergraphs (and small other memory footprint improvements) [PR #2089](https://github.com/apollographql/federation/pull/2089).
- Fix issue with fragment reusing code something mistakenly re-expanding fragments [PR #2098](https://github.com/apollographql/federation/pull/2098).
- Fix issue when type is only reachable through a @provides [PR #2083](https://github.com/apollographql/federation/pull/2083).
- Fix case where some key field necessary to a `@require` fetch were not previously fetched [PR #2075](https://github.com/apollographql/federation/pull/2075).
- Add type definitions to schema extensions [PR #2081](https://github.com/apollographql/federation/pull/2081)
- Update peer dependency `graphql` to `^16.5.0` to use `GraphQLErrorOptions` [PR #2060](https://github.com/apollographql/federation/pull/2060)
- Upgrade underlying `@apollo/utils.fetcher` to support aborting a request. This is a type-only change, and will not impact the underlying runtime. [PR #2017](https://github.com/apollographql/federation/pull/2017).
- Some TypeScript types, such as the arguments and return value of `GraphQLDataSource.process`, are defined using types from the `@apollo/server-gateway-interface` package instead of from `apollo-server-types` and `apollo-server-core`. This is intended to be fully backwards-compatible; please file an issue if this leads to TypeScript compilation issues. [PR #2044](https://github.com/apollographql/federation/pull/2044)
- Don't require `@link` when using `@composeDirective` [PR #2046](https://github.com/apollographql/federation/pull/2046)
- Don't do debug logging by default [PR #2048](https://github.com/apollographql/federation/pull/2048)
- Add `@composeDirective` directive to specify directives that should be merged to the supergraph during composition [PR #1996](https://github.com/apollographql/federation/pull/1996).
- Fix fragment reuse in subgraph fetches [PR #1911](https://github.com/apollographql/federation/pull/1911).
- Allow passing a custom `fetcher` [PR #1997](https://github.com/apollographql/federation/pull/1997).
  - __UNBREAKING__: Previous 2.1.0 alphas removed the custom fetcher for Apollo Uplink. This re-adds that parameter, and requires the fetcher to have the `AbortSignal` interface https://fetch.spec.whatwg.org/#requestinit.
- The method `RemoteGraphQLDataSource.errorFromResponse` now returns a `GraphQLError` (as defined by `graphql`) rather than an `ApolloError` (as defined by `apollo-server-errors`). [PR #2028](https://github.com/apollographql/federation/pull/2028)
  - __BREAKING__: If you call `RemoteGraphQLDataSource.errorFromResponse` manually and expect its return value to be a particular subclass of `GraphQLError`, or if you expect the error received by `didEncounterError` to be a particular subclass of `GraphQLError`, then this change may affect you. We recommend checking `error.extensions.code` instead.
- The `LocalGraphQLDataSource` class no longer supports the undocumented `__resolveObject` Apollo Server feature. [PR #2007](https://github.com/apollographql/federation/pull/2007)
  - __BREAKING__: If you relied on the undocumented `__resolveObject` feature with `LocalGraphQLDataSource`, it will no longer work. If this affects you, file an issue and we can help you find a workaround.
- Expose document representation of sub-query request within GraphQLDataSourceProcessOptions so that it is available to RemoteGraphQLDataSource.process and RemoteGraphQLDataSource.willSendRequest [PR#1878](https://github.com/apollographql/federation/pull/1878)
- Fix issue when using a type condition on an inaccessible type in `@require` [#1873](https://github.com/apollographql/federation/pull/1873).
  - __BREAKING__: this fix required passing a new argument to the `executeQueryPlan` method, which is technically
    exported by the gateway. Most users of the gateway should _not_ call this method directly (which is exported mainly
    for testing purposes in the first place) and will thus be unaffected, but if you do call this method directly, you
    will have to pass the new argument when upgrading. See the method documentation for details.
- Cleanup error related code, adding missing error code to a few errors [PR #1914](https://github.com/apollographql/federation/pull/1914).
- Fix issue generating plan for a "diamond-shaped" dependency [PR #1900](https://github.com/apollographql/federation/pull/1900).
- Fix issue computing query plan costs that can lead to extra unnecessary fetches [PR #1937](https://github.com/apollographql/federation/pull/1937).
- Reject directive applications within `fields` of `@key`, `@provides` and `@requires`[PR #1975](https://github.com/apollographql/federation/pull/1975).
  - __BREAKING__: previously, directive applications within a `@key`, `@provides` or `@requires` were parsed but
    not honored in any way. As this change reject such applications (at composition time), it could theoretically
    require to remove some existing (ignored) directive applications within a `@key`, `@provides` or `@requires`.
- Move `DEFAULT_UPLINK_ENDPOINTS` to static member of `UplinkSupergraphManager` [PR #1977](https://github.com/apollographql/federation/pull/1977).
- Add `node-fetch` as a runtime dependency [PR #1970](https://github.com/apollographql/federation/pull/1970).
- Add timeouts when making requests to Apollo Uplink [PR #1950](https://github.com/apollographql/federation/pull/1950).
  - __BREAKING__: In 2.1.0-alpha.0, `UplinkSupergraphManager` was introduced and allowed passing a `fetcher` argument to the constructor. That parameter has been removed, at least until we figure out how to support the `signal` param more generically in [`apollo-utils` types](https://github.com/apollographql/apollo-utils/pull/146).
- Avoid type-explosion with fed1 supergraphs using a fed2 query planner [PR #1994](https://github.com/apollographql/federation/pull/1994).
- Add callback when fetching a supergraph from Apollo Uplink fails [PR #1812](https://github.com/apollographql/federation/pull/1812).
  -__BREAKING__: Previously, if a custom `fetcher` was passed to the gateway instance, that would be passed to the `UplinkSupergraphManager`. That meant that `fetcher` customizations intended for `RemoteGraphQLDataSource` were also added to `UplinkFetcher`/`UplinkSupergraphManager`. Now, the `fetcher` passed to the gateway instance **will not** be passed to `UplinkSupergraphManager`. If your team relies on fetcher customizations being used for polling Apollo Uplink, please file an issue.
- Expand support for Node.js v18 [PR #1884](https://github.com/apollographql/federation/pull/1884)

## 2.0.5

- Fix bug with unsatisfiable query branch when handling federation 1 supergraph [PR #1908](https://github.com/apollographql/federation/pull/1908).

## 2.0.4

- Fix issue when all root operations were defined in an `extend schema` [PR #1875](https://github.com/apollographql/federation/issues/1875).

## 2.0.3

- Fix bug with type extension of empty type definition [PR #1821](https://github.com/apollographql/federation/pull/1821)
- Fix output of `printSubgraphSchema` method, ensuring it can be read back by composition and `buildSubgraphSchema` [PR #1831](https://github.com/apollographql/federation/pull/1831).
- Fix issue with `@requires` and conditional queries (`@include`/`@skip`) [1835](https://github.com/apollographql/federation/pull/1835).
- Fix bug with field covariance when the underlying plan use type-explosion [1859](https://github.com/apollographql/federation/pull/1859).

## 2.0.2

- The `fetch` implementation used by default by `UplinkFetcher` and `RemoteGraphQLDataSource` is now imported from `make-fetch-happen` v10 instead of v8. The fetcher used by `RemoteGraphQLDataSource` no longer limits the number of simultaneous requests per subgraph (or specifically, per host/port pair) to 15 by default; instead, there is no limit.  (If you want to restore the previous behavior, install `make-fetch-happen`, import `fetcher` from it, and pass `new RemoteGraphQLDataSource({ fetcher: fetcher.defaults(maxSockets: 15)}))` in your `buildService` option.) Note that if you invoke the `fetcher` yourself in a `RemoteGraphQLDataSource` subclass, you should ensure that you pass "plain" objects rather than `Headers` or `Request` objects, as the newer version has slightly different logic about how to recognize `Headers` and `Request` objects. We have adjusted the TypeScript types for `fetcher` so that only these "plain" objects (which result in consistent behavior across all fetcher implementations) are permitted.  [PR #1805](https://github.com/apollographql/federation/pull/1805)
- __BREAKING__: We no longer export a `getDefaultFetcher` function. This function returned the default `fetch` implementation used to talk to Uplink (which is distinct from the default `fetch` implementation used by `RemoteGraphQLDataSource` to talk to subgraphs). It was the fetcher from `make-fetch-happen` v8 with some preset configuration relating to caching and request headers. However, the caching configuration was not actually being used when talking to Uplink (as we talk to Uplink over POST requests, and the Uplink protocol has an application-level mechanism for avoiding unnecessary large responses), and the request headers were already being provided explicitly by the Uplink client code. Since this release is also upgrading `make-fetch-happen`, it is impossible to promise that there would be no behavior change at all to the fetcher returned from `make-fetch-happen`, and as none of the preset configuration is actually relevant to the internal use of `getDefaultFetcher` (which now just uses `make-fetch-happens` without extra configuration), we have removed the function. If you were using this function, you can replace `const fetcher = getDefaultFetcher()` with `import fetcher from 'make-fetch-happen'`. [PR #1805](https://github.com/apollographql/federation/pull/1805)
- Fix `Schema.clone` when directive application happens before definition [PR #1785](https://github.com/apollographql/federation/pull/1785)
- More helpful error message for errors encountered while reading supergraphs generated pre-federation 2 [PR #1796](https://github.com/apollographql/federation/pull/1796)
- Fix handling of @require "chains" (a @require whose fields have @require themselves) [PR #1790](https://github.com/apollographql/federation/pull/1790)
- Fix bug applying an imported federation directive on another directive definition [PR #1797](https://github.com/apollographql/federation/pull/1797).
- Fix bug where planning a query with `@require` impacts the plans of followup queries [PR #1783](https://github.com/apollographql/federation/pull/1783).
- Improve fed1 schema support during composition [PR #1735](https://github.com/apollographql/federation/pull/1735)
- Add missing @apollo/federation-internals dependency to gateway [PR #1721](https://github.com/apollographql/federation/pull/1721)
- Improve merging of groups during `@require` handling in query planning [PR #1732](https://github.com/apollographql/federation/pull/1732)
- Move `__resolveReference` resolvers on to `extensions` [PR #1746](https://github.com/apollographql/federation/pull/1746)
- Add gateway version to schema extensions [PR #1751](https://github.com/apollographql/federation/pull/1751)
- Honor directive imports when directive name is spec name [PR #1720](https://github.com/apollographql/federation/pull/1720)
- Migrate to `@apollo/utils` packages for `createSHA` and `isNodeLike` [PR #1765](https://github.com/apollographql/federation/pull/1765)

## v2.0.1

- Use `for: SECURITY` in the core/link directive application in the supergraph for `@inaccessible` [PR #1715](https://github.com/apollographql/federation/pull/1715)

## v2.0.0

- Previous preview release promoted to general availability! Please see previous changelog entries for full info.

## v2.0.0-preview.14

- Implement `buildSubgraphSchema` using federation internals [PR #1697](https://github.com/apollographql/federation/pull/1697)

## v2.0.0-preview.13

- Revert previous `@apollo/core-schema` update due to incompatibilities with some existing schemas [PR #1704](https://github.com/apollographql/federation/pull/1704)

## v2.0.0-preview.12

- Generate a core schema in `buildSubgraphSchema`, incorporating the latest changes from `@apollo/core-schema` [PR #1554](https://github.com/apollographql/federation/pull/1554)

## v2.0.0-preview.11

- Fix issues validating default values [PR #1692)](https://github.com/apollographql/federation/pull/1692).
- Add a level to hints, uppercase their code and related fixes [PR #1683](https://github.com/apollographql/federation/pull/1683).
- Add support for `@inaccessible` v0.2 [PR #1678](https://github.com/apollographql/federation/pull/1678)

## v2.0.0-preview.10

- Fix merging of Input objects and enum types [PR #1672](https://github.com/apollographql/federation/pull/1672).
- Relax validation of directive redefinition for scalar [PR #1674](https://github.com/apollographql/federation/pull/1674).
- Fix regression in composition validation introduced by #1653 [PR #1673](https://github.com/apollographql/federation/pull/1673) .
- Update logging [PR #1688](https://github.com/apollographql/federation/pull/1688) and test [PR #1685](https://github.com/apollographql/federation/pull/1685/) dependencies.

## v2.0.0-preview.9

- Adds support for the `@override` directive on fields to indicate that a field should be moved from one subgraph to another. [PR #1484](https://github.com/apollographql/federation/pull/1484)
- Fix handling of core/link when definitions are provided or partially so [PR #1662](https://github.com/apollographql/federation/pull/1662).
- Optimize composition validation when many entities spans many subgraphs [PR #1653](https://github.com/apollographql/federation/pull/1653).
- Support for Node 17 [PR #1541](https://github.com/apollographql/federation/pull/1541).
- Adds support for `@tag/v0.2`, which allows the `@tag` directive to be additionally placed on arguments, scalars, enums, enum values, input objects, and input object fields. [PR #1652](https://github.com/apollographql/federation/pull/1652).
- Fix introspection query by adding missing `includeDeprecated` argument for `args` and `inputFields` when defining introspection fields [PR #1584](https://github.com/apollographql/federation/pull/1584)
- Throw a `GraphQLSchemaValidationError` for issues with the `@inaccessible` directive when calling `toApiSchema`. The error will contain a list of all validation errors pertaining to `@inaccessible` [PR #1563](https://github.com/apollographql/federation/pull/1563).

## v2.0.0-preview.8

NOTE: Be sure to update to this version of gateway _before_ upgrading composition. See below and the changelog for `@apollo/composition`.

- Adds support for `@inaccessible` in subgraphs [PR #1638](https://github.com/apollographql/federation/pull/1638).
- Fix merging of `@tag` directive when it is renamed in subgraphs [PR #1637](https://github.com/apollographql/federation/pull/1637).
- Handles supergraphs with `@link` instead of `@core`. Note that you should upgrade gateway to this version before upgrading composition [PR #1628](https://github.com/apollographql/federation/pull/1628).

## v2.0.0-preview.7

- Automatically add the `@tag` directive definition in `buildSubgraphSchema` (but still support it if the definition is present in the input document) [PR #1600](https://github.com/apollographql/federation/pull/1600).

## v2.0.0-preview.5

- Fix propagation of `@tag` to the supergraph and allows @tag to be repeated. Additionally, merged directives (only `@tag` and `@deprecated` currently) are not allowed on external fields anymore [PR #1592](https://github.com/apollographql/federation/pull/1592).

## v2.0.0-preview.4

- Make error messages more actionable when constructing subgraphs from a supergraph [PR #1586](https://github.com/apollographql/federation/pull/1586)
- Respect the `minDelaySeconds` returning from Uplink when polling and retrying to fetch the supergraph schema from Uplink [PR #1564](https://github.com/apollographql/federation/pull/1564)
- Remove the previously deprecated `experimental_pollInterval` config option and deprecate `pollIntervalInMs` in favour of `fallbackPollIntervalInMs` (for managed mode only). [PR #1564](https://github.com/apollographql/federation/pull/1564)
- Correctly detect promises wrapped by proxies in entities resolver [PR #1584](https://github.com/apollographql/federation/pull/1584)

## v2.0.0-preview.3

- Fix issue that created type extensions with descriptions, which is invalid graphQL syntax [PR #1582](https://github.com/apollographql/federation/pull/1582).

## v2.0.0-preview.2

- Re-publishing release which published to npm with stale build artifacts from `version-0.x` release.

## v2.0.0-preview.1

- No-op publish to account for publishing difficulties.

## v2.0.0-preview.0

- Fix merging of arguments by composition [PR #1567](https://github.com/apollographql/federation/pull/1567).
- Adds an optional `resolvable` argument to the `@key` directive [PR #1561](https://github.com/apollographql/federation/pull/1561).
- Generates operation names in query plans when the original query is named [PR #1550](https://github.com/apollographql/federation/pull/1550);
- Allow `@key` to be used on fields with a list type [PR #1510](https://github.com/apollographql/federation/pull/1510)
- Identifies federation 2 schema using new `@link` directive to link to the federation 2 spec. Schema not linking to federation 2 are interpreted as federation 0.x schema and automatically converted before composition [PR #1510](https://github.com/apollographql/federation/pull/1510).
- Adds `@shareable` directive to control when fields are allowed to be resolved by multiple subgraphs [PR #1510](https://github.com/apollographql/federation/pull/1510).

## v2.0.0-alpha.6

- Use specific error classes when throwing errors due Apollo Uplink being unreacheable or returning an invalid response [PR #1473](https://github.com/apollographql/federation/pull/1473)
- __FIX__ Correct retry logic while fetching the supergraph schema from Uplink [PR #1503](https://github.com/apollographql/federation/pull/1503)
- Avoid incomplete subgraphs when extracting them from the supergraph. [PR #1511](https://github.com/apollographql/federation/pull/1511) (via fix to `@apollo/query-planner` and `@apollo/federation-internals`)

## v2.0.0-alpha.5

- Reject mismatching types for interface field implementation if some of those implementations are `@external`, since this can lead to invalid subgraph queries at runtime [PR #1318](https://github.com/apollographql/federation/pull/1318). This limitation should be lifted in the future once the root cause (the invalid runtime queries) is fixed by issue [#1257](https://github.com/apollographql/federation/issues/1257).
- Fix potentially inefficient query plans with multiple `@requires` [PR #1431](https://github.com/apollographql/federation/pull/1431).
- Remove `graphql@15` from peer dependencies [PR #1472](https://github.com/apollographql/federation/pull/1472).

## v2.0.0-alpha.4

- __BREAKING__: This change improves the `supergraphSdl` configuration option to provide a clean and flexible interface for updating gateway schema on load and at runtime. This PR brings a number of updates and deprecations to the gateway. Previous options for loading the gateway's supergraph (`serviceList`, `localServiceList`, `experimental_updateServiceDefinitions`, `experimental_supergraphSdl`) are all deprecated going forward. The migration paths all point to the updated `supergraphSdl` configuration option.

The most notable change here is the introduction of the concept of a `SupergraphManager` (one new possible type of `supergraphSdl`). This interface (when implemented) provides a means for userland code to update the gateway supergraph dynamically, perform subgraph healthchecks, and access subgraph datasources. All of the mentioned deprecated configurations now either use an implementation of a `SupergraphManager` internally or export one to be configured by the user (`IntrospectAndCompose` and `LocalCompose`).

For now: all of the mentioned deprecated configurations will still continue to work as expected. Their usage will come with deprecation warnings advising a switch to `supergraphSdl`.
* `serviceList` users should switch to the now-exported `IntrospectAndCompose` class.
* `localServiceList` users should switch to the similar `LocalCompose` class.
* `experimental_{updateServiceDefinitions|supergraphSdl}` users should migrate their implementation to a custom `SupergraphSdlHook` or `SupergraphManager`.

Since the gateway itself is no longer responsible for composition:
* `experimental_didUpdateComposition` has been renamed more appropriately to `experimental_didUpdateSupergraph` (no signature change)
* `experimental_compositionDidFail` hook is removed

`experimental_pollInterval` is deprecated and will issue a warning. Its renamed equivalent is `pollIntervalInMs`.

Some defensive code around gateway shutdown has been removed which was only relevant to users who are running the gateway within `ApolloServer` before v2.18. If you are still running one of these versions, server shutdown may not happen as smoothly.

[#1246](https://github.com/apollographql/federation/pull/1246)

- Upgrading graphql dependency to `16.2.0` [PR #1129](https://github.com/apollographql/federation/pull/1129).

## v2.0.0-alpha.3

- RemoteGraphQLDataSource will now use `make-fetch-happen` by default rather than `node-fetch` [PR #1284](https://github.com/apollographql/federation/pull/1284)
- __NOOP__: Fix OOB testing w.r.t. nock hygiene. Pushed error reporting endpoint responsibilities up into the gateway class, but there should be no effect on the runtime at all. [PR #1309](https://github.com/apollographql/federation/pull/1309)
- __Multi-cloud Uplink capability__ [PR #1283](https://github.com/apollographql/federation/pull/1283): now, by default two separate Uplink services will be used for schema fetching, the system will round-robin and if one service fails, a retry will occur and the other service will be called. 
  - The Uplink URLs are `https://uplink.api.apollographql.com/` (GCP) and `https://aws.uplink.api.apollographql.com/` (AWS). 
  - To override these defaults and configure what Uplink services, there are two options: 
    - Option #1: use the existing environment variable `APOLLO_SCHEMA_CONFIG_DELIVERY_ENDPOINT` which will now be treated as a comma-separated list of URLs. 
    - Option #2: use the new `uplinkEndpoints`, which must be single URL or a comma-separated list of URLs for the Uplink End-points to be used, and `uplinkMaxRetries` which is how many times the Uplink URLs should be retried.
  - The old `schemaConfigDeliveryEndpoint` configuration value still work, but is deprecated and will be removed in a subsequent release.
- Continue resolving when an `@external` reference cannot be resolved [#376](https://github.com/apollographql/federation/issues/376).
- Fix issue reading some 0.x generated supergraphs [PR #1351](https://github.com/apollographql/federation/pull/1351).
- Assign and document error codes for all errors [PR #1274](https://github.com/apollographql/federation/pull/1274).
- Fix bug in handling of large number of query plan options [1316](https://github.com/apollographql/federation/pull/1316).
- Remove unused dependency on `@apollographql/apollo-tools` [1304](https://github.com/apollographql/federation/pull/1304).

## v2.0.0-alpha.2

- Conditional schema update based on ifAfterId [PR #1152](https://github.com/apollographql/federation/pull/1152)
- __BREAKING__: Bump graphql peer dependency to `^15.7.0` [PR #1200](https://github.com/apollographql/federation/pull/1200)
- __BREAKING__: Remove legacy GCS fetcher for schema updates. If you're currently opted-in to the backwards compatibility provided by setting `schemaConfigDeliveryEndpoint: null`, you may be affected by this update. Please see the PR for additional details. [PR #1226](https://github.com/apollographql/federation/pull/1226)
- Fix the handling of nested `@provides` directives [PR #1148](https://github.com/apollographql/federation/pull/1148).
- Remove outdated composition code. A concrete consequence of which is the removal of the `@apollo/federation` package. If your code was importing the `ServiceDefinition` interface from `@apollo/federation`, this can now be imported from `@apollo/gateway` [PR #1208](https://github.com/apollographql/federation/pull/1208).
- Fix query planner sending queries to a subgraph involving interfaces it doesn't know [#817](https://github.com/apollographql/federation/issues/817).

## v2.0.0-alpha.1

- :tada: Initial alpha release of Federation 2.0.  For more information, see our [documentation](https://www.apollographql.com/docs/federation/v2/).  We look forward to your feedback!

## ⚠️ 0.x Changelog Entries

Changelog entries for gateway 0.x are published on the [version-0.x branch](https://github.com/apollographql/federation/blob/version-0.x/gateway-js/CHANGELOG.md).
