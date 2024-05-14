# CHANGELOG for `@apollo/composition`

## 2.8.0-connectors.3

### Patch Changes

- Updated dependencies []:
  - @apollo/federation-internals@2.8.0-connectors.3
  - @apollo/query-graphs@2.8.0-connectors.3

## 2.8.0-connectors.2

### Patch Changes

- Updated dependencies []:
  - @apollo/federation-internals@2.8.0-connectors.2
  - @apollo/query-graphs@2.8.0-connectors.2

## 2.8.0-connectors.1

### Minor Changes

- Add validations for the `@source` directive ([`9ffa43237e7dc8dc932edfa93dc86dfd4f75f92e`](https://github.com/apollographql/federation/commit/9ffa43237e7dc8dc932edfa93dc86dfd4f75f92e))

### Patch Changes

- Updated dependencies [[`9ffa43237e7dc8dc932edfa93dc86dfd4f75f92e`](https://github.com/apollographql/federation/commit/9ffa43237e7dc8dc932edfa93dc86dfd4f75f92e)]:
  - @apollo/federation-internals@2.8.0-connectors.1
  - @apollo/query-graphs@2.8.0-connectors.1

## 2.8.0-connectors.0

### Minor Changes

- Add validations for the `@source` directive

### Patch Changes

- Updated dependencies []:
  - @apollo/federation-internals@2.8.0-connectors.0
  - @apollo/query-graphs@2.8.0-connectors.0

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

- Updated dependencies []:
  - @apollo/federation-internals@2.7.5
  - @apollo/query-graphs@2.7.5

## 2.7.4

### Patch Changes

- Updated dependencies [[`d80b7f0ca1456567a0866a32d2b2abf940598f77`](https://github.com/apollographql/federation/commit/d80b7f0ca1456567a0866a32d2b2abf940598f77)]:
  - @apollo/federation-internals@2.7.4
  - @apollo/query-graphs@2.7.4

## 2.7.3

### Patch Changes

- Fix a query planning bug where invalid subgraph queries are generated with `reuseQueryFragments` set true. ([#2952](https://github.com/apollographql/federation/issues/2952)) ([#2963](https://github.com/apollographql/federation/pull/2963))

- Updated dependencies [[`ec04c50b4fb832bfd281ecf9c0c2dd7656431b96`](https://github.com/apollographql/federation/commit/ec04c50b4fb832bfd281ecf9c0c2dd7656431b96), [`a494631918156f0431ceace74281c076cf1d5d51`](https://github.com/apollographql/federation/commit/a494631918156f0431ceace74281c076cf1d5d51)]:
  - @apollo/federation-internals@2.7.3
  - @apollo/query-graphs@2.7.3

## 2.7.2

### Patch Changes

- When a linked directive requires a federation version higher than the linked federation spec, upgrade to the implied version and issue a hint ([#2929](https://github.com/apollographql/federation/pull/2929))

- Stop emitting "inconsistent value type" hints against definitions where the type is marked `@external` or all fields are marked `@external`. ([#2951](https://github.com/apollographql/federation/pull/2951))

- Introduce a new composition hint pertaining specifically to progressive `@override` usage (when a `label` argument is present). ([#2922](https://github.com/apollographql/federation/pull/2922))

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

- Support `@join__directive(graphs, name, args)` directives ([#2894](https://github.com/apollographql/federation/pull/2894))

### Patch Changes

- Allow known `FeatureDefinition` subclasses to define custom subgraph schema validation rules ([#2910](https://github.com/apollographql/federation/pull/2910))

- Updated dependencies [[`6ae42942b13dccd246ccc994faa2cb36cd62cb3c`](https://github.com/apollographql/federation/commit/6ae42942b13dccd246ccc994faa2cb36cd62cb3c), [`66833fb8d04c9376f6ed476fed6b1ca237f477b7`](https://github.com/apollographql/federation/commit/66833fb8d04c9376f6ed476fed6b1ca237f477b7), [`931f87c6766c7439936df706727cbdc0cd6bcfd8`](https://github.com/apollographql/federation/commit/931f87c6766c7439936df706727cbdc0cd6bcfd8)]:
  - @apollo/query-graphs@2.7.0
  - @apollo/federation-internals@2.7.0

## 2.6.3

### Patch Changes

- Updated dependencies []:
  - @apollo/federation-internals@2.6.3
  - @apollo/query-graphs@2.6.3

## 2.6.2

### Patch Changes

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

- Updated dependencies []:
  - @apollo/federation-internals@2.5.7
  - @apollo/query-graphs@2.5.7

## 2.5.6

### Patch Changes

- Fixing issue where redeclaration of custom scalars in a fed1 schema may cause upgrade errors ([#2809](https://github.com/apollographql/federation/pull/2809))

- Updated dependencies [[`c719214a`](https://github.com/apollographql/federation/commit/c719214a945564e4afc4bf1610e3dcdfb3838fe1)]:
  - @apollo/federation-internals@2.5.6
  - @apollo/query-graphs@2.5.6

## 2.5.5

### Patch Changes

- Updated dependencies []:
  - @apollo/federation-internals@2.5.5
  - @apollo/query-graphs@2.5.5

## 2.5.4

### Patch Changes

- Updated dependencies []:
  - @apollo/federation-internals@2.5.4
  - @apollo/query-graphs@2.5.4

## 2.5.3

### Patch Changes

- Modifies the type for the argument of the `@requiresScopes` from `[federation__Scope!]!` to `[[federation__Scope!]!]!`. ([#2738](https://github.com/apollographql/federation/pull/2738))

  The `@requiresScopes` directives has been pre-emptively introduced in 2.5.0 to support an upcoming Apollo Router
  feature around scoped accesses. The argument for `@requiresScopes` in that upcoming feature is changed to accommodate a
  new semantic. Note that this technically a breaking change to the `@requiresScopes` directive definition, but as the
  full feature using that directive has been released yet, this directive cannot effectively be used and this should have
  no concrete impact.

- Updated dependencies [[`4b9a512b`](https://github.com/apollographql/federation/commit/4b9a512b62e02544d7854fa198942aac33b93feb), [`c6e0e76d`](https://github.com/apollographql/federation/commit/c6e0e76dbc62662c2aa6ff7f657e374047b11255), [`1add932c`](https://github.com/apollographql/federation/commit/1add932c5cd1297853fb5af9a3a6aaa71243f63a), [`6f1fddb2`](https://github.com/apollographql/federation/commit/6f1fddb25d49262b2ebf6db953371a559dd62e9c)]:
  - @apollo/federation-internals@2.5.3
  - @apollo/query-graphs@2.5.3

## 2.5.2

### Patch Changes

- Updated dependencies [[`35179f08`](https://github.com/apollographql/federation/commit/35179f086ce973e9ae7bb455f7ea7d73cdc10f69)]:
  - @apollo/federation-internals@2.5.2
  - @apollo/query-graphs@2.5.2

## 2.5.1

### Patch Changes

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

- Includes an optional Schema Coordinate field in the Composition Hints returned by composition ([#2658](https://github.com/apollographql/federation/pull/2658))

- For CoreSpecDefintions that opt in, we've added the ability to tie the core spec version to a particular federation version. That means that if there's a new version of, say, the join spec, you won't necessarily get the new version in the supergraph schema if no subgraph requires it. ([#2528](https://github.com/apollographql/federation/pull/2528))

- Introduce the new `@authenticated` directive for composition ([#2644](https://github.com/apollographql/federation/pull/2644))

  > Note that this directive will only be _fully_ supported by the Apollo Router as a GraphOS Enterprise feature at runtime. Also note that _composition_ of valid `@authenticated` directive applications will succeed, but the resulting supergraph will not be _executable_ by the Gateway or an Apollo Router which doesn't have the GraphOS Enterprise entitlement.

  Users may now compose `@authenticated` applications from their subgraphs into a supergraph. This addition will support a future version of Apollo Router that enables authenticated access to specific types and fields via directive applications.

  The directive is defined as follows:

  ```graphql
  directive @authenticated on FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM
  ```

  In order to compose your `@authenticated` usages, you must update your subgraph's federation spec version to v2.5 and add the `@authenticated` import to your existing imports like so:

  ```graphql
  @link(url: "https://specs.apollo.dev/federation/v2.5", import: [..., "@authenticated"])
  ```

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

- Updated dependencies [[`b6be9f96`](https://github.com/apollographql/federation/commit/b6be9f9650a69f6214d806d66b198729560da3dc)]:
  - @apollo/federation-internals@2.4.10
  - @apollo/query-graphs@2.4.10

## 2.4.9

### Patch Changes

- Updated dependencies [[`7ac83456`](https://github.com/apollographql/federation/commit/7ac834568d57a9b9e63002353543d32f6e97b4a5), [`d60349b3`](https://github.com/apollographql/federation/commit/d60349b3fa7e5ba1f64c1727d88dc6faec21a38a), [`1bb7c512`](https://github.com/apollographql/federation/commit/1bb7c5129c7b07627ea33684b538fda8a83b8da8), [`02eab3ac`](https://github.com/apollographql/federation/commit/02eab3ac4a0514bef8f9253a9e43418ba1c17843), [`fd4545c2`](https://github.com/apollographql/federation/commit/fd4545c27ef343ad14436f9541f539ef80bacafa)]:
  - @apollo/query-graphs@2.4.9
  - @apollo/federation-internals@2.4.9

## 2.4.8

### Patch Changes

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

- Updated dependencies []:
  - @apollo/federation-internals@2.4.4
  - @apollo/query-graphs@2.4.4

## 2.4.3

### Patch Changes

- Updated dependencies [[`f6a8c1ce`](https://github.com/apollographql/federation/commit/f6a8c1cee60dc2b602db857b610fe8280674f2ee)]:
  - @apollo/federation-internals@2.4.3
  - @apollo/query-graphs@2.4.3

## 2.4.2

### Patch Changes

- Allow passing print options to the `compose` method to impact how the supergraph is printed, and adds new printing ([#2042](https://github.com/apollographql/federation/pull/2042))
  options to order all elements of the schema.
- Updated dependencies [[`2c370508`](https://github.com/apollographql/federation/commit/2c3705087284710956390c7c3444c812db7c22e0), [`179b4602`](https://github.com/apollographql/federation/commit/179b46028b914ef743674a5c59e0f3a6edc31638)]:
  - @apollo/federation-internals@2.4.2
  - @apollo/query-graphs@2.4.2

## 2.4.1

### Patch Changes

- Start building packages with TS 5.x, which should have no effect on consumers ([#2480](https://github.com/apollographql/federation/pull/2480))

- Updated dependencies [[`450b9578`](https://github.com/apollographql/federation/commit/450b9578ec8d66a48621f0e76fe0b4f738a78659), [`afde3158`](https://github.com/apollographql/federation/commit/afde3158ec2ee93b123a9bdb0f1a852e41fa7f27), [`eafebc3c`](https://github.com/apollographql/federation/commit/eafebc3c9af5c511990fe66b7c2900ba9a1b330f), [`01fe3f83`](https://github.com/apollographql/federation/commit/01fe3f836c08805c1c53b14c745a5117c678866d)]:
  - @apollo/query-graphs@2.4.1
  - @apollo/federation-internals@2.4.1

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
- **BREAKING**: composition now rejects `@override` on interface fields. The `@override` directive was not
  meant to be supported on interfaces and was not having any impact whatsoever. If an existing subgraph does have a
  `@override` on an interface field, this will now be rejected, but the `@override` can simply and safely be removed
  since it previously was ignored.

## 2.2.0

- **BREAKING**: composition now rejects `@shareable` on interface fields. The `@shareable` directive is about
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
- Generates supergraphs with `@link` instead of `@core`. As a result, prior federation 2 pre-release gateway will not read supergraphs generated by this version correctly, so you should upgrade the gateway to this version _before_ re-composing/deploying with this version. [PR #1628](https://github.com/apollographql/federation/pull/1628).

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

- **BREAKING**: Bump graphql peer dependency to `^15.7.0` [PR #1200](https://github.com/apollographql/federation/pull/1200)
- Add missing dependency to `@apollo/query-graphs`

## v2.0.0-alpha.1

- :tada: Initial alpha release of Federation 2.0. For more information, see our [documentation](https://www.apollographql.com/docs/federation/v2/). We look forward to your feedback!
