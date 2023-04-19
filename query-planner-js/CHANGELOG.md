# CHANGELOG for `@apollo/query-planner`

## 2.4.2
### Patch Changes


- Fix potential bug when an `@interfaceObject` type has a `@requires`. When an `@interfaceObject` type has a field with a ([#2524](https://github.com/apollographql/federation/pull/2524))
  `@requires` and the query requests that field only for some specific implementations of the corresponding interface,
  then the generated query plan was sometimes invalid and could result in an invalid query to a subgraph (against a
  subgraph that rely on `@apollo/subgraph`, this lead the subgraph to produce an error message looking like `"The
  _entities resolver tried to load an entity for type X, but no object or interface type of that name was found in the
  schema"`).
- Updated dependencies [[`2c370508`](https://github.com/apollographql/federation/commit/2c3705087284710956390c7c3444c812db7c22e0), [`179b4602`](https://github.com/apollographql/federation/commit/179b46028b914ef743674a5c59e0f3a6edc31638)]:
  - @apollo/federation-internals@2.4.2
  - @apollo/query-graphs@2.4.2

## 2.4.1
### Patch Changes


- Fix issues (incorrectly rejected composition and/or subgraph errors) with `@interfaceObject`. Those issues may occur ([#2494](https://github.com/apollographql/federation/pull/2494))
  either due to some use of `@requires` in an `@interfaceObject` type, or when some subgraph `S` defines a type that is an
  implementation of an interface `I` in the supergraph, and there is an `@interfaceObject` for `I` in another subgraph,
  but `S` does not itself defines `I`.

- Start building packages with TS 5.x, which should have no effect on consumers ([#2480](https://github.com/apollographql/federation/pull/2480))


- Improves reuse of named fragments in subgraph fetches. When a question has named fragments, the code tries to reuse ([#2497](https://github.com/apollographql/federation/pull/2497))
  those fragment in subgraph fetches is those can apply (so when the fragment is fully queried in a single subgraph fetch).
  However, the existing was only able to reuse those fragment in a small subset of cases. This change makes it much more
  likely that _if_ a fragment can be reused, it will be.
- Updated dependencies [[`450b9578`](https://github.com/apollographql/federation/commit/450b9578ec8d66a48621f0e76fe0b4f738a78659), [`afde3158`](https://github.com/apollographql/federation/commit/afde3158ec2ee93b123a9bdb0f1a852e41fa7f27), [`eafebc3c`](https://github.com/apollographql/federation/commit/eafebc3c9af5c511990fe66b7c2900ba9a1b330f), [`01fe3f83`](https://github.com/apollographql/federation/commit/01fe3f836c08805c1c53b14c745a5117c678866d)]:
  - @apollo/query-graphs@2.4.1
  - @apollo/federation-internals@2.4.1

## 2.4.0
### Minor Changes


- This change introduces a configurable query plan cache. This option allows ([#2385](https://github.com/apollographql/federation/pull/2385))
  developers to provide their own query plan cache like so:
  
  ```
  new ApolloGateway({
    queryPlannerConfig: {
      cache: new MyCustomQueryPlanCache(),
    },
  });
  ```
  
  The current default implementation is effectively as follows:
  ```
  import { InMemoryLRUCache } from "@apollo/utils.keyvaluecache";
  
  const cache = new InMemoryLRUCache<string>({
    maxSize: Math.pow(2, 20) * 30,
    sizeCalculation<T>(obj: T): number {
      return Buffer.byteLength(JSON.stringify(obj), "utf8");
    },
  });
  ```
  
  TypeScript users should implement the `QueryPlanCache` type which is now
  exported by `@apollo/query-planner`:
  ```
  import { QueryPlanCache } from '@apollo/query-planner';
  
  class MyCustomQueryPlanCache implements QueryPlanCache {
    // ...
  }
  ```

- Addition of new query planner node types to enable federated subscriptions support ([#2389](https://github.com/apollographql/federation/pull/2389))


- Adds debug/testing query planner options (`debug.bypassPlannerForSingleSubgraph`) to bypass the query planning ([#2441](https://github.com/apollographql/federation/pull/2441))
  process for federated supergraph having only a single subgraph. The option is disabled by default, is not recommended
  for production, and is not supported (it may be removed later). It is meant for debugging/testing purposes.

### Patch Changes


- Refactor the internal implementation of selection sets used by the query planner to decrease the code complexity and ([#2387](https://github.com/apollographql/federation/pull/2387))
  improve query plan generation performance in many cases.

- Fix query planner assertion error when types with no common supertypes are requested at the same path ([#2467](https://github.com/apollographql/federation/pull/2467))


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


- This change introduces a configurable query plan cache. This option allows ([#2385](https://github.com/apollographql/federation/pull/2385))
  developers to provide their own query plan cache like so:
  
  ```
  new ApolloGateway({
    queryPlannerConfig: {
      cache: new MyCustomQueryPlanCache(),
    },
  });
  ```
  
  The current default implementation is effectively as follows:
  ```
  import { InMemoryLRUCache } from "@apollo/utils.keyvaluecache";
  
  const cache = new InMemoryLRUCache<string>({
    maxSize: Math.pow(2, 20) * 30,
    sizeCalculation<T>(obj: T): number {
      return Buffer.byteLength(JSON.stringify(obj), "utf8");
    },
  });
  ```
  
  TypeScript users should implement the `QueryPlanCache` type which is now
  exported by `@apollo/query-planner`:
  ```
  import { QueryPlanCache } from '@apollo/query-planner';
  
  class MyCustomQueryPlanCache implements QueryPlanCache {
    // ...
  }
  ```

- Addition of new query planner node types to enable federated subscriptions support ([#2389](https://github.com/apollographql/federation/pull/2389))


- Adds debug/testing query planner options (`debug.bypassPlannerForSingleSubgraph`) to bypass the query planning ([#2441](https://github.com/apollographql/federation/pull/2441))
  process for federated supergraph having only a single subgraph. The option is disabled by default, is not recommended
  for production, and is not supported (it may be removed later). It is meant for debugging/testing purposes.

### Patch Changes

- Updated dependencies [[`6e2d24b5`](https://github.com/apollographql/federation/commit/6e2d24b5491914316b9930395817f0c3780f181a), [`1a555d98`](https://github.com/apollographql/federation/commit/1a555d98f2030814ebd5074269d035b7f298f71e)]:
  - @apollo/federation-internals@2.4.0-alpha.0
  - @apollo/query-graphs@2.4.0-alpha.0

## 2.3.5
### Patch Changes


- Fix query planner assertion error when types with no common supertypes are requested at the same path ([#2467](https://github.com/apollographql/federation/pull/2467))

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


- Fix assertion errors thrown by the query planner when querying fields for a specific interface implementation in some cases where `@interfaceObject` is involved ([#2362](https://github.com/apollographql/federation/pull/2362))


- Fix issue where the query planner was incorrectly not querying `__typename` in a subgraph fetch when `@interfaceObject` is involved ([#2366](https://github.com/apollographql/federation/pull/2366))

- Updated dependencies [[`7e2ca46f`](https://github.com/apollographql/federation/commit/7e2ca46f57dccae6f5037c64d8719cee72adfe88)]:
  - @apollo/query-graphs@2.3.1
  - @apollo/federation-internals@2.3.1

This CHANGELOG pertains only to Apollo Federation packages in the 2.x range. The Federation v0.x equivalent for this package can be found [here](https://github.com/apollographql/federation/blob/version-0.x/query-planner-js/CHANGELOG.md) on the `version-0.x` branch of this repo.

## 2.3.0
- Fix issue with some `@interfaceObject` queries due to missing "input rewrites" [PR #2346](https://github.com/apollographql/federation/pull/2346).

## 2.3.0-beta.2
- Fix potential issue with nested `@defer` in non-deferrable case [PR #2312](https://github.com/apollographql/federation/pull/2312).
- Fix possible assertion error during query planning [PR #2299](https://github.com/apollographql/federation/pull/2299).
- Improves generation of plans once all path options are computed [PR #2316](https://github.com/apollographql/federation/pull/2316).

## 2.2.2

- Fix issue with path in query plan's deferred nodes [PR #2281](https://github.com/apollographql/federation/pull/2281).
  - __BREAKING__: Any code relying directly on the query plan handling of `@defer` will need to potentially update its
      handling of the `path` before upgrading to this version. This is *not* a concern for end-user of federation. 

## 2.2.0

- __BREAKING__: Disable exposing full document to sub-query by default (introduced in 2.1.0):
  - This change decreases memory consumption in general (which is the reason for disabling this by
    default), but users that have custom code making use of `GraphQLDataSourceProcessOptions.document`
    will now need to explicitly set `GatewayConfig.queryPlannerConfig.exposeDocumentNodeInFetchNode`.
- Drop support for node12 [PR #2202](https://github.com/apollographql/federation/pull/2202)
- Avoid reusing named fragments that are invalid for the subgraph [PR #2255](https://github.com/apollographql/federation/pull/2255).
- Fix QP not always type-exploding interface when necessary [PR #2246](https://github.com/apollographql/federation/pull/2246).
- Fix potential QP issue with shareable root fields [PR #2239](https://github.com/apollographql/federation/pull/2239).

## 2.1.4

- Optimize plan for defer where only keys are fetched [PR #2182](https://github.com/apollographql/federation/pull/2182).

## 2.1.3

- Fix building subgraph selections using the wrong underlying schema [PR #2155](https://github.com/apollographql/federation/pull/2155).

## 2.1.2

- Fix issue with path #2137 (optimization for `__typename`) [PR #2140](https://github.com/apollographql/federation/pull/2140).
- Fix potential inefficient planning due to `__typename` [PR #2137](https://github.com/apollographql/federation/pull/2137).
- Fix potential assertion during query planning [PR #2133](https://github.com/apollographql/federation/pull/2133).
- Fix some defer query plans having invalid result sets (with empty branches) [PR #2125](https://github.com/apollographql/federation/pull/2125). 
- Fix defer information lost when cloning fetch group (resulting in non-deferred parts) [PR #2129](https://github.com/apollographql/federation/pull/2129).
- Fix directives on fragment spread being lost [PR #2126](https://github.com/apollographql/federation/pull/2126).

## 2.1.1

- Fix issue where @defer condition gets ignored [PR #2121](https://github.com/apollographql/federation/pull/2121).

## 2.1.0

- Fix issue where fragment expansion can erase applied directives (most notably `@defer`) [PR #2093](https://github.com/apollographql/federation/pull/2093).
- Fix issue with fragment reusing code something mistakenly re-expanding fragments [PR #2098](https://github.com/apollographql/federation/pull/2098).
- Update peer dependency `graphql` to `^16.5.0` to use `GraphQLErrorOptions` [PR #2060](https://github.com/apollographql/federation/pull/2060)
- Add `@defer` support [PR #1958](https://github.com/apollographql/federation/pull/1958)
- Fix fragment reuse in subgraph fetches [PR #1911](https://github.com/apollographql/federation/pull/1911).
- Expose document representation of sub-query request within GraphQLDataSourceProcessOptions so that it is available to RemoteGraphQLDataSource.process and RemoteGraphQLDataSource.willSendRequest [PR #1878](https://github.com/apollographql/federation/pull/1878)
- Fix issue computing query plan costs that can lead to extra unnecessary fetches [PR #1937](https://github.com/apollographql/federation/pull/1937).
- Avoid type-explosion with fed1 supergraphs using a fed2 query planner [PR #1994](https://github.com/apollographql/federation/pull/1994).
- Expand support for Node.js v18 [PR #1884](https://github.com/apollographql/federation/pull/1884)

## 2.0.3

- Fix issue with `@requires` and conditional queries (`@include`/`@skip`) [1835](https://github.com/apollographql/federation/pull/1835).
- Fix bug with field covariance when the underlying plan use type-explosion [1859](https://github.com/apollographql/federation/pull/1859).

## 2.0.2

- Fix handling of @require "chains" (a @require whose fields have @require themselves) [PR #1790](https://github.com/apollographql/federation/pull/1790)
- Improve merging of groups during `@require` handling in query planning [PR #1732](https://github.com/apollographql/federation/pull/1732)

## v2.0.1

- Released in sync with other federation packages but no changes to this package.

## v2.0.0

- Previous preview release promoted to general availability! Please see previous changelog entries for full info.

## v2.0.0-preview.9

- Adds Support for `@tag/v0.2`, which allows the `@tag` directive to be additionally placed on arguments, scalars, enums, enum values, input objects, and input object fields. [PR #1652](https://github.com/apollographql/federation/pull/1652).
- Adds support for the `@override` directive on fields to indicate that a field should be moved from one subgraph to another. [PR #1484](https://github.com/apollographql/federation/pull/1484)

## v2.0.0-preview.2

- Re-publishing release which published to npm with stale build artifacts from `version-0.x` release.


## v2.0.0-preview.1

- No-op publish to account for publishing difficulties.

## v2.0.0-preview.0

- Initial "preview" release.

## v2.0.0-alpha.6

- Avoid incomplete subgraphs when extracting them from the supergraph. [PR #1511](https://github.com/apollographql/federation/pull/1511) (via fix to `@apollo/federation-internals`)
- Add an `operationKind` property to the query plan which will be either `query` or `mutation`.  This allows data sources to make decisions about the subgraph request without needing to re-parse the operation. [PR #1427](https://github.com/apollographql/federation/pull/1427)

## v2.0.0-alpha.5

- Fix potentially inefficient query plans with multiple `@requires` [PR #1431](https://github.com/apollographql/federation/pull/1431).
- Remove `graphql@15` from peer dependencies [PR #1472](https://github.com/apollographql/federation/pull/1472).

## v2.0.0-alpha.3

- Fix bug in handling of large number of query plan options [1316](https://github.com/apollographql/federation/pull/1316).

## v2.0.0-alpha.2

- __BREAKING__: Bump graphql peer dependency to `^15.7.0` [PR #1200](https://github.com/apollographql/federation/pull/1200)
- Fix the handling of nested `@provides` directives [PR #1148](https://github.com/apollographql/federation/pull/1148).
- Fix query planner sending queries to a subgraph involving interfaces it doesn't know [#817](https://github.com/apollographql/federation/issues/817).

## v2.0.0-alpha.1

- :tada: Initial alpha release of Federation 2.0.  For more information, see our [documentation](https://www.apollographql.com/d      ocs/federation/v2/).  We look forward to your feedback!

## v0.5.2

- Updates to transitive dependencies.  No other substantial changes.

## v0.5.1

- Adjustments to internal TypeScript types [PR #1030](https://github.com/apollographql/federation/pull/1030)

## v0.5.0

- __BREAKING__: This is a breaking change due to a `peerDependencies` update (`graphql@^15.4.0` -> `graphql@^15.5.3`). This `graphql` version includes a fix which is being necessarily adopted within the `@apollo/federation` package. See associated CHANGELOG entry in the `federation-js` folder for additional details. [PR #1008](https://github.com/apollographql/federation/pull/1008)

## v0.3.1

- Narrow `graphql` peer dependency to a more fitting range `^15.4.0` based on our current usage of the package. This requirement was introduced by, but not captured in, changes within the recently released `@apollo/query-planner@0.3.0`. As such, this change will be released as a `patch` since the breaking change already accidentally happened and this is a correction to that oversight. [PR #913](https://github.com/apollographql/federation/pull/913)

# v0.3.0

-  Introduce support for removing @inaccessible elements from the API schema. [PR #807](https://github.com/apollographql/federation/pull/859)
- Mask inaccessible typenames in runtime operation errors. [PR #893](https://github.com/apollographql/federation/pull/893)

# v0.2.3

- Permit @tag and @inaccessible core declarations. [PR #859](https://github.com/apollographql/federation/pull/859)

# v0.2.2

- types: Explicitly declare `FetchGroup[]` return type from `dependentGroups` in `buildQueryPlan`.

# v0.2.1

- Fix plan querying a subgraph with an interface it doesn't know due to directives. [PR #805](https://github.com/apollographql/federation/pull/805) [Issue #801](https://github.com/apollographql/federation/issues/801)

# v0.2.0

- Expand the range of supported `node` versions in the package's `engines` specifier to include the now-tested Node.js `16`. [PR #713](https://github.com/apollographql/federation/pull/713)

# v0.1.4

- Add missing `deep-equal` dependency, which was accidentally installed to the monorepo's root. [PR #709](https://github.com/apollographql/federation/pull/709)

# v0.1.3

- Fix query plans missing fields in some situations involving nested type conditions (#396).
- Fix duplicate fetches in query plans [PR #671](https://github.com/apollographql/federation/pull/671).

# v0.1.2

- This change is mostly a set of follow-up changes for PR #622. Most of these changes are internal (renaming, etc.). Some noteworthy changes worth mentioning are: the splitting of entity and value type metadata types and a conversion of GraphMap to an actual `Map` (which resulted in some additional assertions). [PR #656](https://github.com/apollographql/federation/pull/656)

# v0.1.1

- Remove unnecessary dependency on `@apollo/query-planner-wasm`

# v0.1.0

- Initial release of TypeScript query planner code extracted from `@apollo/gateway`. (Previous releases of this package were wrappers around `@apollo/query-planner-wasm`, a different implementation.)
