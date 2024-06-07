# CHANGELOG for `@apollo/query-planner`

## 2.8.0

### Minor Changes

- Implement new directives to allow getting and setting context. This allows resolvers to reference and access data referenced by entities that exist in the GraphPath that was used to access the field. The following example demonstrates the ability to access the `prop` field within the Child resolver. ([#2988](https://github.com/apollographql/federation/pull/2988))

  ```graphql
  type Query {
    p: Parent!
  }
  type Parent @key(fields: "id") @context(name: "context") {
    id: ID!
    child: Child!
    prop: String!
  }
  type Child @key(fields: "id") {
    id: ID!
    b: String!
    field(a: String @fromContext(field: "$context { prop }")): Int!
  }
  ```

### Patch Changes

- Various set context bugfixes ([#3017](https://github.com/apollographql/federation/pull/3017))

- Fix relative path logic when eliding subgraph jumps for `@fromContext` ([#3005](https://github.com/apollographql/federation/pull/3005))

- Updated dependencies [[`c4744da360235d8bb8270ea048f0e0fa5d03be1e`](https://github.com/apollographql/federation/commit/c4744da360235d8bb8270ea048f0e0fa5d03be1e), [`8a936d741a0c05835ff2533714cf330d18209179`](https://github.com/apollographql/federation/commit/8a936d741a0c05835ff2533714cf330d18209179), [`f5fe3e74d36722f78004c1e2e03c77d8b95cd6bf`](https://github.com/apollographql/federation/commit/f5fe3e74d36722f78004c1e2e03c77d8b95cd6bf)]:
  - @apollo/query-graphs@2.8.0
  - @apollo/federation-internals@2.8.0

## 2.8.0-alpha.1

### Patch Changes

- Updated dependencies [[`f5fe3e74d36722f78004c1e2e03c77d8b95cd6bf`](https://github.com/apollographql/federation/commit/f5fe3e74d36722f78004c1e2e03c77d8b95cd6bf)]:
  - @apollo/query-graphs@2.8.0-alpha.1
  - @apollo/federation-internals@2.8.0-alpha.1

## 2.8.0-alpha.0

### Minor Changes

- Implement new directives to allow getting and setting context. This allows resolvers to reference and access data referenced by entities that exist in the GraphPath that was used to access the field. The following example demonstrates the ability to access the `prop` field within the Child resolver. ([#2988](https://github.com/apollographql/federation/pull/2988))

  ```graphql
  type Query {
    p: Parent!
  }
  type Parent @key(fields: "id") @context(name: "context") {
    id: ID!
    child: Child!
    prop: String!
  }
  type Child @key(fields: "id") {
    id: ID!
    b: String!
    field(a: String @fromContext(field: "$context { prop }")): Int!
  }
  ```

### Patch Changes

- Fix relative path logic when eliding subgraph jumps for `@fromContext` ([#3005](https://github.com/apollographql/federation/pull/3005))

- Updated dependencies [[`c4744da360235d8bb8270ea048f0e0fa5d03be1e`](https://github.com/apollographql/federation/commit/c4744da360235d8bb8270ea048f0e0fa5d03be1e)]:
  - @apollo/query-graphs@2.8.0-alpha.0
  - @apollo/federation-internals@2.8.0-alpha.0

## 2.7.8

### Patch Changes

- Triggering a clean 2.7.8 release now that harmonizer build has been fixed. ([#3010](https://github.com/apollographql/federation/pull/3010))

- Updated dependencies [[`2ad72802044310a528e8944f4538efe519424504`](https://github.com/apollographql/federation/commit/2ad72802044310a528e8944f4538efe519424504)]:
  - @apollo/federation-internals@2.7.8
  - @apollo/query-graphs@2.7.8

## 2.7.7

### Patch Changes

- No logical changes since 2.7.5 or 2.7.6, but we fixed a bug in the release process, so we need to publish a new patch version (2.7.7). ([#2999](https://github.com/apollographql/federation/pull/2999))

- Updated dependencies [[`bee0b0828b4fb6a1d3172ac330560e2ab6c046bb`](https://github.com/apollographql/federation/commit/bee0b0828b4fb6a1d3172ac330560e2ab6c046bb)]:
  - @apollo/federation-internals@2.7.7
  - @apollo/query-graphs@2.7.7

## 2.7.6

### Patch Changes

- There is no functionality change between 2.7.5 and 2.7.6. Triggering new release as previous one released partially leading to a broken experience. ([#2997](https://github.com/apollographql/federation/pull/2997))

- Updated dependencies []:
  - @apollo/federation-internals@2.7.6
  - @apollo/query-graphs@2.7.6

## 2.7.5

### Patch Changes

- Fix issue with missing fragment definitions due to `generateQueryFragments`. ([#2993](https://github.com/apollographql/federation/pull/2993))

  An incorrect implementation detail in `generateQueryFragments` caused certain queries to be missing fragment definitions. Specifically, subsequent fragment "candidates" with the same type condition and the same length of selections as a previous fragment weren't correctly added to the list of fragments. An example of an affected query is:

  ```graphql
  query {
    t {
      ... on A {
        x
        y
      }
    }
    t2 {
      ... on A {
        y
        z
      }
    }
  }
  ```

  In this case, the second selection set would be converted to an inline fragment spread to subgraph fetches, but the fragment definition would be missing.

- Updated dependencies []:
  - @apollo/federation-internals@2.7.5
  - @apollo/query-graphs@2.7.5

## 2.7.4

### Patch Changes

- Fixed a regression created by PR (#2967), where directives would not be properly attached to their parent. (#2982) ([#2984](https://github.com/apollographql/federation/pull/2984))

- Ensure query variables used in the directives applied at the operation level are retained in subgraph queries (#2986) ([#2986](https://github.com/apollographql/federation/pull/2986))

- Updated dependencies [[`d80b7f0ca1456567a0866a32d2b2abf940598f77`](https://github.com/apollographql/federation/commit/d80b7f0ca1456567a0866a32d2b2abf940598f77)]:
  - @apollo/federation-internals@2.7.4
  - @apollo/query-graphs@2.7.4

## 2.7.3

### Patch Changes

- Fix a query planning bug where invalid subgraph queries are generated with `reuseQueryFragments` set true. ([#2952](https://github.com/apollographql/federation/issues/2952)) ([#2963](https://github.com/apollographql/federation/pull/2963))

- Type conditioned fetching ([#2949](https://github.com/apollographql/federation/pull/2949))

  When querying a field that is in a path of 2 or more unions, the query planner was not able to handle different selections and would aggressively collapse selections in fetches yielding an incorrect plan.

  This change introduces new syntax to express type conditions in (key and flatten) paths. Type conditioned fetching can be enabled through a flag, and execution is supported in the router only. (#2938)

- Fixed query planner to pass the directives from original query to subgraph operations (#2961) ([#2967](https://github.com/apollographql/federation/pull/2967))

- Updated dependencies [[`ec04c50b4fb832bfd281ecf9c0c2dd7656431b96`](https://github.com/apollographql/federation/commit/ec04c50b4fb832bfd281ecf9c0c2dd7656431b96), [`a494631918156f0431ceace74281c076cf1d5d51`](https://github.com/apollographql/federation/commit/a494631918156f0431ceace74281c076cf1d5d51)]:
  - @apollo/federation-internals@2.7.3
  - @apollo/query-graphs@2.7.3

## 2.7.2

### Patch Changes

- When auto-upgrading a subgraph (i.e. one that does not explicitly @link the federation spec) do not go past v2.4. This is so that subgraphs will not inadvertently require the latest join spec (which cause the router or gateway not to start if running an older version). ([#2933](https://github.com/apollographql/federation/pull/2933))

- Add new `generateQueryFragments` option to query planner config ([#2958](https://github.com/apollographql/federation/pull/2958))

  If enabled, the query planner will extract inline fragments into fragment definitions before sending queries to subgraphs. This can significantly reduce the size of the query sent to subgraphs, but may increase the time it takes to plan the query.

- Updated dependencies [[`33b937b18d3c7ca6af14b904696b536399e597d1`](https://github.com/apollographql/federation/commit/33b937b18d3c7ca6af14b904696b536399e597d1), [`09cd3e55e810ee513127b7440f5b11af7540c9b0`](https://github.com/apollographql/federation/commit/09cd3e55e810ee513127b7440f5b11af7540c9b0), [`d7189a86c27891af408d3d0184db6133d3342967`](https://github.com/apollographql/federation/commit/d7189a86c27891af408d3d0184db6133d3342967)]:
  - @apollo/federation-internals@2.7.2
  - @apollo/query-graphs@2.7.2

## 2.7.1

### Patch Changes

- Updated dependencies [[`493f5acd16ad92adf99c963659cd40dc5eac1219`](https://github.com/apollographql/federation/commit/493f5acd16ad92adf99c963659cd40dc5eac1219)]:
  - @apollo/federation-internals@2.7.1
  - @apollo/query-graphs@2.7.1

## 2.7.0

### Minor Changes

- Implement progressive `@override` functionality ([#2911](https://github.com/apollographql/federation/pull/2911))

  The progressive `@override` feature brings a new argument to the `@override` directive: `label: String`. When a label is added to an `@override` application, the override becomes conditional, depending on parameters provided to the query planner (a set of which labels should be overridden). Note that this feature will be supported in router for enterprise users only.

  Out-of-the-box, the router will support a percentage-based use case for progressive `@override`. For example:

  ```graphql
  type Query {
    hello: String @override(from: "original", label: "percent(5)")
  }
  ```

  The above example will override the root `hello` field from the "original" subgraph 5% of the time.

  More complex use cases will be supported by the router via the use of coprocessors/rhai to resolve arbitrary labels to true/false values (i.e. via a feature flag service).

### Patch Changes

- Updated dependencies [[`6ae42942b13dccd246ccc994faa2cb36cd62cb3c`](https://github.com/apollographql/federation/commit/6ae42942b13dccd246ccc994faa2cb36cd62cb3c), [`66833fb8d04c9376f6ed476fed6b1ca237f477b7`](https://github.com/apollographql/federation/commit/66833fb8d04c9376f6ed476fed6b1ca237f477b7), [`931f87c6766c7439936df706727cbdc0cd6bcfd8`](https://github.com/apollographql/federation/commit/931f87c6766c7439936df706727cbdc0cd6bcfd8)]:
  - @apollo/query-graphs@2.7.0
  - @apollo/federation-internals@2.7.0

## 2.6.3

### Patch Changes

- Fix handling of `@interfaceObject` when multiple child query paths are available. ([#2898](https://github.com/apollographql/federation/pull/2898))

  When making copies of `FetchDependencyGraph`s, we were making incomplete copies that were missing `__typename` input rewrite information required for correctly handling `@interfaceObject` resolution.

- pruneClosedBranches() was more computationally intensive than just running sort on all the branches. This can lead to an order of magnitude speedup on type exploded query plans. ([#2905](https://github.com/apollographql/federation/pull/2905))

- Updated dependencies []:
  - @apollo/federation-internals@2.6.3
  - @apollo/query-graphs@2.6.3

## 2.6.2

### Patch Changes

- Add a limit to the number of options for a selection. In some cases, we will generate a lot of possible paths to access a field. There is a process to remove redundant paths, but when the list is too large, that process gets very expensive. To prevent that, we introduce an optional limit that will reject the query if too many paths are generated ([#2880](https://github.com/apollographql/federation/pull/2880))

- Updated dependencies [[`7b5b836d15247c997712a47847f603aa5887312e`](https://github.com/apollographql/federation/commit/7b5b836d15247c997712a47847f603aa5887312e), [`74ca7dd617927a20d79b824851f7651ef3c40a4e`](https://github.com/apollographql/federation/commit/74ca7dd617927a20d79b824851f7651ef3c40a4e), [`3f7392b84f8b626b248b59ce81f193d0f0272045`](https://github.com/apollographql/federation/commit/3f7392b84f8b626b248b59ce81f193d0f0272045)]:
  - @apollo/federation-internals@2.6.2
  - @apollo/query-graphs@2.6.2

## 2.6.1

### Patch Changes

- Updated dependencies [[`0d5ab01a`](https://github.com/apollographql/federation/commit/0d5ab01a4e91bac10f47732fee3fe4d8017f051f)]:
  - @apollo/federation-internals@2.6.1
  - @apollo/query-graphs@2.6.1

## 2.6.0

### Minor Changes

- Update `license` field in `package.json` to use `Elastic-2.0` SPDX identifier ([#2741](https://github.com/apollographql/federation/pull/2741))

- Introduce the new `@policy` scope for composition ([#2818](https://github.com/apollographql/federation/pull/2818))

  > Note that this directive will only be _fully_ supported by the Apollo Router as a GraphOS Enterprise feature at runtime. Also note that _composition_ of valid `@policy` directive applications will succeed, but the resulting supergraph will not be _executable_ by the Gateway or an Apollo Router which doesn't have the GraphOS Enterprise entitlement.

  Users may now compose `@policy` applications from their subgraphs into a supergraph.

  The directive is defined as follows:

  ```graphql
  scalar federation__Policy

  directive @policy(
    policies: [[federation__Policy!]!]!
  ) on FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM
  ```

  The `Policy` scalar is effectively a `String`, similar to the `FieldSet` type.

  In order to compose your `@policy` usages, you must update your subgraph's federation spec version to v2.6 and add the `@policy` import to your existing imports like so:

  ```graphql
  @link(url: "https://specs.apollo.dev/federation/v2.6", import: [..., "@policy"])
  ```

### Patch Changes

- Updated dependencies [[`b18841be`](https://github.com/apollographql/federation/commit/b18841be897e6d4f47454568776f199e2adb60ae), [`e325b499`](https://github.com/apollographql/federation/commit/e325b499d592dabe61c93112c292c92ca10afbc5)]:
  - @apollo/query-graphs@2.6.0
  - @apollo/federation-internals@2.6.0

## 2.5.7

### Patch Changes

- Fix query planning bug where keys or required fields can sometimes reach subgraphs with null values. ([#2805](https://github.com/apollographql/federation/issues/2805)) ([#2859](https://github.com/apollographql/federation/pull/2859))

- Updated dependencies []:
  - @apollo/federation-internals@2.5.7
  - @apollo/query-graphs@2.5.7

## 2.5.6

### Patch Changes

- Updated dependencies [[`c719214a`](https://github.com/apollographql/federation/commit/c719214a945564e4afc4bf1610e3dcdfb3838fe1)]:
  - @apollo/federation-internals@2.5.6
  - @apollo/query-graphs@2.5.6

## 2.5.5

### Patch Changes

- Fix specific case for requesting \_\_typename on interface entity type ([#2775](https://github.com/apollographql/federation/pull/2775))

  In certain cases, when resolving a \_\_typename on an interface entity (due to it actual being requested in the operation), that fetch group could previously be trimmed / treated as useless. At a glance, it appears to be a redundant step, i.e.:

  ```
  { ... on Product { __typename id }} => { ... on Product { __typename} }
  ```

  It's actually necessary to preserve this in the case that we're coming from an interface object to an (entity) interface so that we can resolve the concrete \_\_typename correctly.

- Don't preserve useless fetches which downgrade \_\_typename from a concrete type back to its interface type. ([#2778](https://github.com/apollographql/federation/pull/2778))

  In certain cases, the query planner was preserving some fetches which were "useless" that would rewrite **typename from its already-resolved concrete type back to its interface type. This could result in (at least) requested fields being "filtered" from the final result due to the interface's **typename in the data where the concrete type's \_\_typename was expected.

  Specifically, the solution was compute the path between newly created groups and their parents when we know that it's trivial (`[]`). Further along in the planning process, this allows to actually remove the known-useless group.

- Updated dependencies []:
  - @apollo/federation-internals@2.5.5
  - @apollo/query-graphs@2.5.5

## 2.5.4

### Patch Changes

- Fix some potentially incorrect query plans with `@requires` when some dependencies are involved. ([#2726](https://github.com/apollographql/federation/pull/2726))

  In some rare case of `@requires`, an over-eager optimisation was incorrectly considering that
  a dependency between 2 subgraph fetches was unnecessary, leading to doing 2 subgraphs queries
  in parallel when those should be done sequentially (because the 2nd query rely on results
  from the 1st one). This effectively resulted in the required fields not being provided (the
  consequence of which depends a bit on the resolver detail, but if the resolver expected
  the required fields to be populated (as they should), then this could typically result
  in a message of the form `GraphQLError: Cannot read properties of null`).

- Updated dependencies []:
  - @apollo/federation-internals@2.5.4
  - @apollo/query-graphs@2.5.4

## 2.5.3

### Patch Changes

- Fix potential assertion error for named fragment on abstract types when the abstract type does not have the same ([#2725](https://github.com/apollographql/federation/pull/2725))
  possible runtime types in all subgraphs.

  The error manifested itself during query planning with an error message of the form `Cannot normalize X at Y ...`.

- More aggressive ignoring of indirect paths from root types when a more direct alternative exists. This optimisation ([#2669](https://github.com/apollographql/federation/pull/2669))
  slightly generalize an existing heuristic of the query planner, allowing it to ignore some known inefficient options
  earlier in its process. When this optimisation can be used, this yield faster query plan computation, but by reducing
  the number of plans to be consider, this can sometimes prevent the planner to degrade it's output when it consider
  there is too many plans to consider, which can result in more optimal query plans too.
- Updated dependencies [[`4b9a512b`](https://github.com/apollographql/federation/commit/4b9a512b62e02544d7854fa198942aac33b93feb), [`c6e0e76d`](https://github.com/apollographql/federation/commit/c6e0e76dbc62662c2aa6ff7f657e374047b11255), [`1add932c`](https://github.com/apollographql/federation/commit/1add932c5cd1297853fb5af9a3a6aaa71243f63a), [`6f1fddb2`](https://github.com/apollographql/federation/commit/6f1fddb25d49262b2ebf6db953371a559dd62e9c)]:
  - @apollo/federation-internals@2.5.3
  - @apollo/query-graphs@2.5.3

## 2.5.2

### Patch Changes

- Fix over-eager merging of fields with different directive applications ([#2713](https://github.com/apollographql/federation/pull/2713))

  Previously, the following query would incorrectly combine the selection set of `hello`, with both fields ending up under the `@skip` condition:

  ```graphql
  query Test($skipField: Boolean!) {
    hello @skip(if: $skipField) {
      world
    }
    hello {
      goodbye
    }
  }
  ```

  This change identifies those two selections on `hello` as unique while constructing our operation representation so they aren't merged at all, leaving it to the subgraph to handle the operation as-is.

- Updated dependencies [[`35179f08`](https://github.com/apollographql/federation/commit/35179f086ce973e9ae7bb455f7ea7d73cdc10f69)]:
  - @apollo/federation-internals@2.5.2
  - @apollo/query-graphs@2.5.2

## 2.5.1

### Patch Changes

- Reapply #2639: ([#2687](https://github.com/apollographql/federation/pull/2687))

  Try reusing named fragments in subgraph fetches even if those fragment only apply partially to the subgraph. Before this change, only named fragments that were applying entirely to a subgraph were tried, leading to less reuse that expected. Concretely, this change can sometimes allow the generation of smaller subgraph fetches.

  Additionally, resolve a bug which surfaced in the fragment optimization logic which could result in invalid/incorrect optimizations / fragment reuse.

- Updated dependencies [[`b9052fdd`](https://github.com/apollographql/federation/commit/b9052fddfcd2cae1ea750aaea27f0a0b24f4e691)]:
  - @apollo/federation-internals@2.5.1
  - @apollo/query-graphs@2.5.1

## 2.5.0

### Minor Changes

- Do not run the full suite of graphQL validations on supergraphs and their extracted subgraphs by default in production environment. ([#2657](https://github.com/apollographql/federation/pull/2657))

  Running those validations on every updates of the schema takes a non-negligible amount of time (especially on large
  schema) and mainly only serves in catching bugs early in the supergraph handling code, and in some limited cases,
  provide slightly better messages when a corrupted supergraph is received, neither of which is worth the cost in
  production environment.

  A new `validateSupergraph` option is also introduced in the gateway configuration to force this behaviour.

- Introduce the new `@requiresScopes` directive for composition ([#2649](https://github.com/apollographql/federation/pull/2649))

  > Note that this directive will only be _fully_ supported by the Apollo Router as a GraphOS Enterprise feature at runtime. Also note that _composition_ of valid `@requiresScopes` directive applications will succeed, but the resulting supergraph will not be _executable_ by the Gateway or an Apollo Router which doesn't have the GraphOS Enterprise entitlement.

  Users may now compose `@requiresScopes` applications from their subgraphs into a supergraph. This addition will support a future version of Apollo Router that enables scoped access to specific types and fields via directive applications.

  The directive is defined as follows:

  ```graphql
  scalar federation__Scope

  directive @requiresScopes(
    scopes: [federation__Scope!]!
  ) on FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM
  ```

  The `Scope` scalar is effectively a `String`, similar to the `FieldSet` type.

  In order to compose your `@requiresScopes` usages, you must update your subgraph's federation spec version to v2.5 and add the `@requiresScopes` import to your existing imports like so:

  ```graphql
  @link(url: "https://specs.apollo.dev/federation/v2.5", import: [..., "@requiresScopes"])
  ```

### Patch Changes

- Updated dependencies [[`fe1e3d7b`](https://github.com/apollographql/federation/commit/fe1e3d7b13ed76ac81e8fd6d911f4497995c59aa), [`6b18af50`](https://github.com/apollographql/federation/commit/6b18af50910872049938386b82ad40703d934f68), [`9396c0d6`](https://github.com/apollographql/federation/commit/9396c0d686092c06fa89f8512378610bfe4154cc), [`2b5796a9`](https://github.com/apollographql/federation/commit/2b5796a962b3478961f9486c28f5cfd161fafbb0), [`4f3c3b9e`](https://github.com/apollographql/federation/commit/4f3c3b9eedb5dacb6dee29aa21bb74cdd1244732)]:
  - @apollo/query-graphs@2.5.0
  - @apollo/federation-internals@2.5.0

## 2.4.10

### Patch Changes

- Revert #2639 from v2.4.9 ([#2681](https://github.com/apollographql/federation/pull/2681))

  PR #2639 attempts to resolve issues with query fragment reuse, but we've since turned up multiple issues (at least 1 of which is a regression - see #2680. For now, this reverts it until we resolve the regression for a future patch release.

- Updated dependencies [[`b6be9f96`](https://github.com/apollographql/federation/commit/b6be9f9650a69f6214d806d66b198729560da3dc)]:
  - @apollo/federation-internals@2.4.10
  - @apollo/query-graphs@2.4.10

## 2.4.9

### Patch Changes

- Improves query planning time in some situations where entities use multiple keys. ([#2610](https://github.com/apollographql/federation/pull/2610))

- Try reusing named fragments in subgraph fetches even if those fragment only apply partially to the subgraph. Before this change, only named fragments that were applying entirely to a subgraph were tried, leading to less reuse that expected. Concretely, this change can sometimes allow the generation of smaller subgraph fetches. ([#2639](https://github.com/apollographql/federation/pull/2639))

- Updated dependencies [[`7ac83456`](https://github.com/apollographql/federation/commit/7ac834568d57a9b9e63002353543d32f6e97b4a5), [`d60349b3`](https://github.com/apollographql/federation/commit/d60349b3fa7e5ba1f64c1727d88dc6faec21a38a), [`1bb7c512`](https://github.com/apollographql/federation/commit/1bb7c5129c7b07627ea33684b538fda8a83b8da8), [`02eab3ac`](https://github.com/apollographql/federation/commit/02eab3ac4a0514bef8f9253a9e43418ba1c17843), [`fd4545c2`](https://github.com/apollographql/federation/commit/fd4545c27ef343ad14436f9541f539ef80bacafa)]:
  - @apollo/query-graphs@2.4.9
  - @apollo/federation-internals@2.4.9

## 2.4.8

### Patch Changes

- Fix bug in the handling of dependencies of subgraph fetches. This bug was manifesting itself as an assertion error ([#2622](https://github.com/apollographql/federation/pull/2622))
  thrown during query planning with a message of the form `Root groups X should have no remaining groups unhandled (...)`.

- Fix issues in code to reuse named fragments. One of the fixed issue would manifest as an assertion error with a message ([#2619](https://github.com/apollographql/federation/pull/2619))
  looking like `Cannot add fragment of condition X (...) to parent type Y (...)`. Another would manifest itself by
  generating an invalid subgraph fetch where a field conflicts with another version of that field that is in a reused
  named fragment.

- Fix query planner heuristic that could lead to ignoring some valid option and yielding a non-optimal query plan. ([#2623](https://github.com/apollographql/federation/pull/2623))

- Updated dependencies [[`62e0d254`](https://github.com/apollographql/federation/commit/62e0d254f92a6a259032cda5e1ce810ae6478022), [`7f1ef73e`](https://github.com/apollographql/federation/commit/7f1ef73ee00b82c9b4b1bbfd23f3be10e3a1e176), [`2a97f372`](https://github.com/apollographql/federation/commit/2a97f3727b02760ccdf796a4f2e399778ff0593f)]:
  - @apollo/federation-internals@2.4.8
  - @apollo/query-graphs@2.4.8

## 2.4.7

### Patch Changes

- Re-work the code use to try to reuse query named fragments to improve performance (thus sometimes improving query ([#2604](https://github.com/apollographql/federation/pull/2604))
  planning performance), to fix a possibly raised assertion error (with a message of form like `Cannot add selection of
field X to selection set of parent type Y`), and to fix a rare issue where an interface or union field was not being
  queried for all the types it should be.
- Updated dependencies [[`2d44f346`](https://github.com/apollographql/federation/commit/2d44f346c553f489d83f1c672e1ad8715665cde2)]:
  - @apollo/federation-internals@2.4.7
  - @apollo/query-graphs@2.4.7

## 2.4.6

### Patch Changes

- Fix assertion error in some overlapping fragment cases. In some cases, when fragments overlaps on some sub-selections ([#2594](https://github.com/apollographql/federation/pull/2594))
  and some interface field implementation relied on sub-typing, an assertion error could be raised with a message of
  the form `Cannot add selection of field X to selection set of parent type Y` and this fixes this problem.

- Adds `debug.maxEvaluatedPlans` query planning configuration options. This option limits the maximum number of query plan ([#2593](https://github.com/apollographql/federation/pull/2593))
  that may have to be evaluated during a query planning phase, thus capping the maximum query planning runtime, but at the
  price of potentially reducing the optimality of the generated query plan (which may mean slower query executions). This
  option is exposed for debugging purposes, but it is recommended to rely on the default in production.

- Fix possible fragment-related assertion error during query planning. This prevents a rare case where an assertion with a ([#2596](https://github.com/apollographql/federation/pull/2596))
  message of the form `Cannot add fragment of condition X (runtimes: ...) to parent type Y (runtimes: ...)` could fail
  during query planning.
- Updated dependencies [[`5cd17e69`](https://github.com/apollographql/federation/commit/5cd17e6965664768c9d9f5b734634764bbebf2e7), [`e136ad87`](https://github.com/apollographql/federation/commit/e136ad87db6005ddd8100f98022a043c0846f38e)]:
  - @apollo/federation-internals@2.4.6
  - @apollo/query-graphs@2.4.6

## 2.4.5

### Patch Changes

- Supersedes v2.4.4 due to a publishing error with no dist/ folder ([#2583](https://github.com/apollographql/federation/pull/2583))

- Updated dependencies [[`c96e24c4`](https://github.com/apollographql/federation/commit/c96e24c448bde3c4acfa5332335e868c701d7621)]:
  - @apollo/federation-internals@2.4.5
  - @apollo/query-graphs@2.4.5

## 2.4.4

### Patch Changes

- Fix potential assertion error during query planning in some multi-field `@requires` case. This error could be triggered ([#2575](https://github.com/apollographql/federation/pull/2575))
  when a field in a `@requires` depended on another field that was also part of that same requires (for instance, if a
  field has a `@requires(fields: "id otherField")` and that `id` is also a key necessary to reach the subgraph providing
  `otherField`).

  The assertion error thrown in that case contained the message `Root groups (...) should have no remaining groups unhandled (...)`

- Updated dependencies []:
  - @apollo/federation-internals@2.4.4
  - @apollo/query-graphs@2.4.4

## 2.4.3

### Patch Changes

- Improves the heuristics used to try to reuse the query named fragments in subgraph fetches. Said fragment will be reused ([#2541](https://github.com/apollographql/federation/pull/2541))
  more often, which can lead to smaller subgraph queries (and hence overall faster processing).
- Updated dependencies [[`f6a8c1ce`](https://github.com/apollographql/federation/commit/f6a8c1cee60dc2b602db857b610fe8280674f2ee)]:
  - @apollo/federation-internals@2.4.3
  - @apollo/query-graphs@2.4.3

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
  - **BREAKING**: Any code relying directly on the query plan handling of `@defer` will need to potentially update its
    handling of the `path` before upgrading to this version. This is _not_ a concern for end-user of federation.

## 2.2.0

- **BREAKING**: Disable exposing full document to sub-query by default (introduced in 2.1.0):
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
- Add an `operationKind` property to the query plan which will be either `query` or `mutation`. This allows data sources to make decisions about the subgraph request without needing to re-parse the operation. [PR #1427](https://github.com/apollographql/federation/pull/1427)

## v2.0.0-alpha.5

- Fix potentially inefficient query plans with multiple `@requires` [PR #1431](https://github.com/apollographql/federation/pull/1431).
- Remove `graphql@15` from peer dependencies [PR #1472](https://github.com/apollographql/federation/pull/1472).

## v2.0.0-alpha.3

- Fix bug in handling of large number of query plan options [1316](https://github.com/apollographql/federation/pull/1316).

## v2.0.0-alpha.2

- **BREAKING**: Bump graphql peer dependency to `^15.7.0` [PR #1200](https://github.com/apollographql/federation/pull/1200)
- Fix the handling of nested `@provides` directives [PR #1148](https://github.com/apollographql/federation/pull/1148).
- Fix query planner sending queries to a subgraph involving interfaces it doesn't know [#817](https://github.com/apollographql/federation/issues/817).

## v2.0.0-alpha.1

- :tada: Initial alpha release of Federation 2.0. For more information, see our [documentation](https://www.apollographql.com/d ocs/federation/v2/). We look forward to your feedback!

## v0.5.2

- Updates to transitive dependencies. No other substantial changes.

## v0.5.1

- Adjustments to internal TypeScript types [PR #1030](https://github.com/apollographql/federation/pull/1030)

## v0.5.0

- **BREAKING**: This is a breaking change due to a `peerDependencies` update (`graphql@^15.4.0` -> `graphql@^15.5.3`). This `graphql` version includes a fix which is being necessarily adopted within the `@apollo/federation` package. See associated CHANGELOG entry in the `federation-js` folder for additional details. [PR #1008](https://github.com/apollographql/federation/pull/1008)

## v0.3.1

- Narrow `graphql` peer dependency to a more fitting range `^15.4.0` based on our current usage of the package. This requirement was introduced by, but not captured in, changes within the recently released `@apollo/query-planner@0.3.0`. As such, this change will be released as a `patch` since the breaking change already accidentally happened and this is a correction to that oversight. [PR #913](https://github.com/apollographql/federation/pull/913)

# v0.3.0

- Introduce support for removing @inaccessible elements from the API schema. [PR #807](https://github.com/apollographql/federation/pull/859)
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
