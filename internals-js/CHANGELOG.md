# CHANGELOG for `@apollo/federation-internals`

## 2.5.0
### Minor Changes


- Do not run the full suite of graphQL validations on supergraphs and their extracted subgraphs by default in production environment. ([#2657](https://github.com/apollographql/federation/pull/2657))
  
  Running those validations on every updates of the schema takes a non-negligible amount of time (especially on large
  schema) and mainly only serves in catching bugs early in the supergraph handling code, and in some limited cases,
  provide slightly better messages when a corrupted supergraph is received, neither of which is worth the cost in
  production environment.
  
  A new `validateSupergraph` option is also introduced in the gateway configuration to force this behaviour.

- For CoreSpecDefintions that opt in, we've added the ability to tie the core spec version to a particular federation version. That means that if there's a new version of, say, the join spec, you won't necessarily get the new version in the supergraph schema if no subgraph requires it. ([#2528](https://github.com/apollographql/federation/pull/2528))


- Introduce the new `@authenticated` directive for composition ([#2644](https://github.com/apollographql/federation/pull/2644))
  
  > Note that this directive will only be _fully_ supported by the Apollo Router as a GraphOS Enterprise feature at runtime. Also note that _composition_ of valid `@authenticated` directive applications will succeed, but the resulting supergraph will not be _executable_ by the Gateway or an Apollo Router which doesn't have the GraphOS Enterprise entitlement.
  
  Users may now compose `@authenticated` applications from their subgraphs into a supergraph. This addition will support a future version of Apollo Router that enables authenticated access to specific types and fields via directive applications.
  
  The directive is defined as follows:
  
  ```graphql
  directive @authenticated on
    | FIELD_DEFINITION
    | OBJECT
    | INTERFACE
    | SCALAR
    | ENUM
  ```
  
  In order to compose your `@authenticated` usages, you must update your subgraph's federation spec version to v2.5 and add the `@authenticated` import to your existing imports like so:
  ```graphql
  @link(url: "https://specs.apollo.dev/federation/v2.5", import: [..., "@authenticated"])
  ```

- Refactor/cleanup code that extract subgraphs schema from the supergraph during query planning. ([#2655](https://github.com/apollographql/federation/pull/2655))


- Introduce the new `@requiresScopes` directive for composition ([#2649](https://github.com/apollographql/federation/pull/2649))
  
  > Note that this directive will only be _fully_ supported by the Apollo Router as a GraphOS Enterprise feature at runtime. Also note that _composition_ of valid `@requiresScopes` directive applications will succeed, but the resulting supergraph will not be _executable_ by the Gateway or an Apollo Router which doesn't have the GraphOS Enterprise entitlement.
  
  Users may now compose `@requiresScopes` applications from their subgraphs into a supergraph. This addition will support a future version of Apollo Router that enables scoped access to specific types and fields via directive applications.
  
  The directive is defined as follows:
  
  ```graphql
  scalar federation__Scope
  
  directive @requiresScopes(scopes: [federation__Scope!]!) on
    | FIELD_DEFINITION
    | OBJECT
    | INTERFACE
    | SCALAR
    | ENUM
  ```
  
  The `Scope` scalar is effectively a `String`, similar to the `FieldSet` type.
  
  In order to compose your `@requiresScopes` usages, you must update your subgraph's federation spec version to v2.5 and add the `@requiresScopes` import to your existing imports like so:
  ```graphql
  @link(url: "https://specs.apollo.dev/federation/v2.5", import: [..., "@requiresScopes"])
  ```

## 2.4.10
### Patch Changes


- Revert #2639 from v2.4.9 ([#2681](https://github.com/apollographql/federation/pull/2681))
  
  PR #2639 attempts to resolve issues with query fragment reuse, but we've since turned up multiple issues (at least 1 of which is a regression - see #2680. For now, this reverts it until we resolve the regression for a future patch release.

## 2.4.9
### Patch Changes


- Improves query planning time in some situations where entities use multiple keys. ([#2610](https://github.com/apollographql/federation/pull/2610))


- Try reusing named fragments in subgraph fetches even if those fragment only apply partially to the subgraph. Before this change, only named fragments that were applying entirely to a subgraph were tried, leading to less reuse that expected. Concretely, this change can sometimes allow the generation of smaller subgraph fetches. ([#2639](https://github.com/apollographql/federation/pull/2639))


- Fix issue in the code to reuse fragments that, in some rare circumstances, could led to invalid queries where a named ([#2659](https://github.com/apollographql/federation/pull/2659))
  spread was use in an invalid position. If triggered, this resulted in an subgraph fetch whereby a named spread was
  used inside a sub-selection even though the spread condition did not intersect the parent type (the exact error message
  would depend on the client library used to handle subgraph fetches, but with GraphQL-js, the error message had the
  form "Fragment <F> cannot be spread here as objects of type <X> can never be of type <Y>").

- Fix regression in named fragment reuse introduced by 2.4.8 that caused fragments that were only used by other fragments ([#2648](https://github.com/apollographql/federation/pull/2648))
  to not be reused, even if they are making the overall query smaller and thus should be reused.

- Fix unnecessary busy work in the code extracting subgraphs from supergraphs. This code is executing when a new ([#2654](https://github.com/apollographql/federation/pull/2654))
  supergraph is deployed, and can impact gateway clients when it runs. This is often not a problem, but for
  large supergraphs with lots of subgraphs, an obvious inefficiency could make the code take much longer than
  it should have.

## 2.4.8
### Patch Changes


- Fix issue where subgraph fetches may have unused fragments (and are thus invalid). ([#2628](https://github.com/apollographql/federation/pull/2628))


- Fix issues in code to reuse named fragments. One of the fixed issue would manifest as an assertion error with a message ([#2619](https://github.com/apollographql/federation/pull/2619))
  looking like `Cannot add fragment of condition X (...) to parent type Y (...)`. Another would manifest itself by
  generating an invalid subgraph fetch where a field conflicts with another version of that field that is in a reused
  named fragment.

## 2.4.7
### Patch Changes


- Re-work the code use to try to reuse query named fragments to improve performance (thus sometimes improving query ([#2604](https://github.com/apollographql/federation/pull/2604))
  planning performance), to fix a possibly raised assertion error (with a message of form like `Cannot add selection of
  field X to selection set of parent type Y`), and to fix a rare issue where an interface or union field was not being
  queried for all the types it should be.

## 2.4.6
### Patch Changes


- Fix assertion error in some overlapping fragment cases. In some cases, when fragments overlaps on some sub-selections ([#2594](https://github.com/apollographql/federation/pull/2594))
  and some interface field implementation relied on sub-typing, an assertion error could be raised with a message of
  the form `Cannot add selection of field X to selection set of parent type Y` and this fixes this problem.

- Fix possible fragment-related assertion error during query planning. This prevents a rare case where an assertion with a ([#2596](https://github.com/apollographql/federation/pull/2596))
  message of the form `Cannot add fragment of condition X (runtimes: ...) to parent type Y (runtimes: ...)` could fail
  during query planning.

## 2.4.5
### Patch Changes


- Supersedes v2.4.4 due to a publishing error with no dist/ folder ([#2583](https://github.com/apollographql/federation/pull/2583))

## 2.4.4

## 2.4.3
### Patch Changes


- Improves the heuristics used to try to reuse the query named fragments in subgraph fetches. Said fragment will be reused ([#2541](https://github.com/apollographql/federation/pull/2541))
  more often, which can lead to smaller subgraph queries (and hence overall faster processing).

## 2.4.2
### Patch Changes


- Allow passing print options to the `compose` method to impact how the supergraph is printed, and adds new printing ([#2042](https://github.com/apollographql/federation/pull/2042))
  options to order all elements of the schema.

- Fix potential bug when an `@interfaceObject` type has a `@requires`. When an `@interfaceObject` type has a field with a ([#2524](https://github.com/apollographql/federation/pull/2524))
  `@requires` and the query requests that field only for some specific implementations of the corresponding interface,
  then the generated query plan was sometimes invalid and could result in an invalid query to a subgraph (against a
  subgraph that rely on `@apollo/subgraph`, this lead the subgraph to produce an error message looking like `"The
  _entities resolver tried to load an entity for type X, but no object or interface type of that name was found in the
  schema"`).

## 2.4.1
### Patch Changes


- Fix issues (incorrectly rejected composition and/or subgraph errors) with `@interfaceObject`. Those issues may occur ([#2494](https://github.com/apollographql/federation/pull/2494))
  either due to some use of `@requires` in an `@interfaceObject` type, or when some subgraph `S` defines a type that is an
  implementation of an interface `I` in the supergraph, and there is an `@interfaceObject` for `I` in another subgraph,
  but `S` does not itself defines `I`.

- Fix assertion error during query planning in some cases where queries has some unsatisfiable branches (a part of the ([#2486](https://github.com/apollographql/federation/pull/2486))
  query goes through type conditions that no runtime types satisfies).

- Start building packages with TS 5.x, which should have no effect on consumers ([#2480](https://github.com/apollographql/federation/pull/2480))


- Improves reuse of named fragments in subgraph fetches. When a question has named fragments, the code tries to reuse ([#2497](https://github.com/apollographql/federation/pull/2497))
  those fragment in subgraph fetches is those can apply (so when the fragment is fully queried in a single subgraph fetch).
  However, the existing was only able to reuse those fragment in a small subset of cases. This change makes it much more
  likely that _if_ a fragment can be reused, it will be.

## 2.4.0
### Patch Changes


- Refactor the internal implementation of selection sets used by the query planner to decrease the code complexity and ([#2387](https://github.com/apollographql/federation/pull/2387))
  improve query plan generation performance in many cases.

- Revert #2293. Removing URL import causes a problem when running under deno. ([#2451](https://github.com/apollographql/federation/pull/2451))


- Use globally available URL object instead of node builtin "url" module ([#2293](https://github.com/apollographql/federation/pull/2293))


- Optimises query plan generation for parts of queries that can statically be known to not cross across subgraphs ([#2449](https://github.com/apollographql/federation/pull/2449))

## 2.4.0-alpha.1
### Patch Changes


- Revert #2293. Removing URL import causes a problem when running under deno. ([#2451](https://github.com/apollographql/federation/pull/2451))

## 2.4.0-alpha.0
### Patch Changes


- Handle defaulted variables correctly during post-processing. ([#2443](https://github.com/apollographql/federation/pull/2443))
  
  Users who tried to use built-in conditional directives (skip/include) with _defaulted_ variables and no variable provided would encounter an error thrown by operation post-processing saying that the variables weren't provided. The defaulted values went unaccounted for, so the operation would validate but then fail an assertion while resolving the conditional.
  
  With this change, defaulted variable values are now collected and provided to post-processing (with defaults being overwritten by variables that are actually provided).


## 2.3.5

## 2.3.4
### Patch Changes

- Use globally available URL object instead of node builtin "url" module ([#2293](https://github.com/apollographql/federation/pull/2293))

## 2.3.3

## 2.3.2

## 2.3.1

## 2.3.0

- Fix incorrect handling of `@external` on a type when dealing when adding `@shareable` during fed1 schema upgrades [PR #2343](https://github.com/apollographql/federation/pull/2343).

## 2.2.1

- Fix federation spec always being expanded to the last version [PR #2274](https://github.com/apollographql/federation/pull/2274).

## 2.2.0

- Preserve default values of input object fields [PR #2218](https://github.com/apollographql/federation/pull/2218).
- Provide support for marking @external on object type [PR #2214](https://github.com/apollographql/federation/pull/2214)
- Drop support for node12 [PR #2202](https://github.com/apollographql/federation/pull/2202)
- Correctly reject field names starting with `__` [PR #2237](https://github.com/apollographql/federation/pull/2237).
- Preserve default values of input object fields [PR #2218](https://github.com/apollographql/federation/pull/2218).

## 2.1.4

- Ensures supergraph `@defer`/`@stream` definitions of supergraph are not included in the API schema [PR #2212](https://github.com/apollographql/federation/pull/2212).
- Fix validation of variable on input field not taking default into account [PR #2176](https://github.com/apollographql/federation/pull/2176).

## 2.1.0

- Update peer dependency `graphql` to `^16.5.0` to use `GraphQLErrorOptions` [PR #2060](https://github.com/apollographql/federation/pull/2060)
- Don't require `@link` when using `@composeDirective` [PR #2046](https://github.com/apollographql/federation/pull/2046)
- Add `@defer` support [PR #1958](https://github.com/apollographql/federation/pull/1958)
- Add `@composeDirective` directive to specify directives that should be merged to the supergraph during composition [PR #1996](https://github.com/apollographql/federation/pull/1996).
- Expand support for Node.js v18 [PR #1884](https://github.com/apollographql/federation/pull/1884)

## 2.0.4

- Fix issue when all root operations were defined in an `extend schema` [PR #1875](https://github.com/apollographql/federation/issues/1875).

## 2.0.3

- Fix bug with type extension of empty type definition [PR #1821](https://github.com/apollographql/federation/pull/1821)

## 2.0.2

- Fix bug removing an enum type [PR #1813](https://github.com/apollographql/federation/pull/1813)
- Fix `Schema.clone` when directive application happens before definition [PR #1785](https://github.com/apollographql/federation/pull/1785)
- More helpful error message for errors encountered while reading supergraphs generated pre-federation 2 [PR #1796](https://github.com/apollographql/federation/pull/1796)
- Fix bug applying an imported federation directive on another directive definition [PR #1797](https://github.com/apollographql/federation/pull/1797).
- Prevent non-core-feature elements from being marked @inaccessible if referenced by core feature elements [PR #1769](https://github.com/apollographql/federation/pull/1769)
- Improve fed1 schema support during composition [PR #1735](https://github.com/apollographql/federation/pull/1735)
- Honor directive imports when directive name is spec name [PR #1720](https://github.com/apollographql/federation/pull/1720)

## v2.0.1

- Use `for: SECURITY` in the core/link directive application in the supergraph for `@inaccessible` [PR #1715](https://github.com/apollographql/federation/pull/1715)

## v2.0.0

- Previous preview release promoted to general availability! Please see previous changelog entries for full info.

## v2.0.0-preview.14

- Implement `buildSubgraphSchema` using federation internals [PR #1697](https://github.com/apollographql/federation/pull/1697)


## v2.0.0-preview.11

- Add support for `@inaccessible` v0.2 [PR #1678](https://github.com/apollographql/federation/pull/1678)
- Add a level to hints, uppercase their code and related fixes [PR #1683](https://github.com/apollographql/federation/pull/1683).

## v2.0.0-preview.9

- Adds Support for `@tag/v0.2`, which allows the `@tag` directive to be additionally placed on arguments, scalars, enums, enum values, input objects, and input object fields. [PR #1652](https://github.com/apollographql/federation/pull/1652).
- Add missing `includeDeprecated` argument for `args` and `inputFields` when defining introspection fields [PR #1584](https://github.com/apollographql/federation/pull/1584)
- Adds support for the `@override` directive on fields to indicate that a field should be moved from one subgraph to another. [PR #1484](https://github.com/apollographql/federation/pull/1484)

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
