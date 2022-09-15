# Roadmap

This document defines a high level roadmap for Apollo Federation and upcoming
releases. Community and contributor involvement is vital for successfully
implementing all desired items for each release. We hope the items listed below
will inspire further engagement from the community to keep Apollo Federation
progressing and shipping exciting and valuable features.

Any dates listed below and specific issues that will ship in a given milestone
are subject to change but should give a general idea of what we are planning.

We are actively maintaining both the original Federation 1 (on the [version-0.x
branch](https://github.com/apollographql/federation/tree/version-0.x)) and the
new Federation 2 (on the [main branch](https://github.com/apollographql/federation)).

## Table of Contents

* [What's next](#whats-next)
  * [Next Release](#next-release)
  * [Under Consideration](#under-consideration)

* [Released](#released)
  * [Federation 2 GA](#federation-2-ga)
  * [Federation 2 Preview](#federation-2-preview)
  * [Federation 2 Alpha](#federation-2-alpha)
  * [Gateway Enhancements](#gateway-enhancements)
  * [Federation 1](#federation-1)
  * [Subgraph Compatibility Test Results](#subgraph-compatibility-test-results)

## What's Next

### Next Release

* `@tag` export to API schema
* Compose user-defined directives in subgraphs

### Under Consideration

* `@defer` support in query planning
* Subscriptions support in query planning
* Entity interfaces can be spread across multiple subgraphs & interface queries with `@interfaceObject` helper.
* Harmonizing shared value types across subgraphs to a canonical desired state.
* Advanced caching, auth, demand control, rate limiting, governance, and more!
* Importing shared types into subgraph schemas, to keep things more DRY.
* Nested `@provides` support beyond what Fed 2 already supports natively.
* Process subgraph and supergraph schemas with a new [core-schema-js](https://github.com/apollographql/core-schema-js) library.
* Expanded use of [core schemas](https://github.com/apollographql/core-schema-js) to compose your own directives in subgraphs.
* Type merging that can be relaxed even further with `@default` - [#1187](https://github.com/apollographql/federation/issues/1187)
* Lots more!


## Released

### Federation 2 GA

* Backwards compatible with Federation 1
  * [Migration](https://www.apollographql.com/docs/federation/v2/federation-2/moving-to-federation-2) is a simple and incremental process
  * [@apollo/gateway v2.0.0](https://www.npmjs.com/package/@apollo/gateway/v/2.0.0?activeTab=versions) supports Fed 1 and Fed 2 supergraphs
  * Composition 2.x auto-converts Fed 1 subgraphs with [rover 0.5+](https://www.apollographql.com/docs/rover/getting-started)
  * Upgrade subgraphs one at a time with [@apollo/subgraph v2](https://www.npmjs.com/package/@apollo/subgraph/v/2.0.0?activeTab=versions)
  * New `@link` directive for subgraphs to `import` [Fed 2 directives](https://github.com/apollographql/federation/blob/main/designs/Federation%202%20GA%20authorship%20UX.md#using-federation-2)
* Build with a smoother developer experience
  * Cleaner syntax
  * First-class support for shared interfaces, enums, and more

* Deliver smaller increments with better shared types
  * Flexible value type merging
  * Hide fields with `@inaccessible` - [#1178](https://github.com/apollographql/federation/issues/1178)
  * All types shared equally across subgraphs without `extend`
  * All fields have a single source of truth by default
  * `@shareable` to opt-into denormalization of fields for performance

* Field migration across subgraphs with `@override` - [#1177](https://github.com/apollographql/federation/issues/1177)
  * Accepts production traffic without downtime
  * Remove the old field with no delivery coordination

* Catch errors sooner with improved static analysis
  * More descriptive error messages
  * New composition engine validates all theoretically possible queries
  * Composition hints to show divergence across merged types

* More subgraphs support Federation 2 syntax
  * [18 subgraph-compatible libraries](https://www.apollographql.com/docs/federation/other-servers)
  * [Subgraph spec](https://www.apollographql.com/docs/federation/subgraph-spec)
* Enhanced test automation

### Federation 2 Preview

* [Federation Authorship UX design](https://github.com/apollographql/federation/blob/main/designs/Federation%202%20GA%20authorship%20UX.md)
* Enhanced [shared ownership model & field sharing](https://github.com/apollographql/federation/blob/main/designs/Federation%202%20GA%20authorship%20UX.md#field-sharing)
  * All fields have a single source of truth by default:
  * relax ownership with `@shareable` to denormalize for performance [#1176](https://github.com/apollographql/federation/issues/1176)
  * `@shareable` required to `@provides` a field
* Updated [join spec](https://specs.apollo.dev/join/v0.1/) with Federation 2 enhancements
* Automatic conversion of Fed 1 subgraphs to equivalent Fed 2 subgraphs during Fed 2 composition
* Enhanced backwards compatibility test automation
* [`rover` support for Fed 2 composition](https://www.apollographql.com/docs/federation/v2/quickstart/setup#1-install-the-rover-cli)
* [@apollo/gateway v2.0.0-preview](https://www.npmjs.com/package/@apollo/gateway/v/2.0.0-preview.7?activeTab=versions)
* [@apollo/subgraph v2.0.0-preview](https://www.npmjs.com/package/@apollo/subgraph/v/2.0.0-preview.7?activeTab=versions)
* Updated [Fed 2 docs](https://www.apollographql.com/docs/federation/v2/) & [migration guide](https://www.apollographql.com/docs/federation/v2/federation-2/moving-to-federation-2)

### Federation 2 Alpha

* [Announcing Federation 2 - Blog Post](https://www.apollographql.com/blog/announcement/backend/announcing-federation-2/)
* Backwards compatible, requiring no major changes to your subgraphs.
* New v2 Apollo Gateway -- continues to support all existing plugins and customizations.
* New v2 Subgraph package -- separates composition from subgraph enablement code and is backwards compatible so no changes needed.
* Rover CLI and Apollo Workbench releases with Federation 2 composition support.

* Cleaner syntax for a smoother developer experience
  * Build with any natural GraphQL schema
  * First-class support for value type merging of shared interfaces, enums, and other value types.
  * Common tasks like extending a federated type or denormalizing a field for better performance are now possible without special directives and keywords.

* Deliver smaller increments with better shared types
  * Improved shared ownership model with enhanced type merging
  * Flexible `value type merging` is now supported
    * Value types don’t need to be identical across subgraphs.
    * Value type definitions are now merged into a single unified type, much like type merging support for federated types today. Smaller incremental changes, like adding a field, can often be rolled out one subgraph at a time.
  * `Federated entity types` have improved shared ownership
    * Fields can now exist in multiple subgraphs simultaneously.
    * This paves the way for natively supported field migrations with an asynchronous transfer of ownership from one subgraph to another with no downtime or tight release coordination.
* Catch errors sooner with improved static analysis
  * Deeper static analysis, better error messages and a new generalized composition model that helps you catch more errors at build-time instead of at runtime.
  * Clean-sheet implementation of the core composition and query-planning engine that powers the Apollo Gateway
  * The rewritten composition engine now validates all theoretically possible queries and provides more descriptive error messages when a query can’t be satisfied.

* New composition hints help you understand how schema definitions influence query planning and performance. We’ve integrated them into the powerful tools for Apollo Federation:
  * Apollo Workbench shows composition hints in the problems tray with new hover tips.
  * Rover includes composition hints in both standard and structured JSON output so you can integrate them with other tools in your pipeline.
  * Apollo Studio uses composition hints to help you ensure design guidelines and best practices.

* v2 Gateway can run supergraph schemas produced using either Federation 1 composition or the new Federation 2 composition.
  * Supergraph schemas specify the [core features](https://specs.apollo.dev/) they require for `SECURITY` and `EXECUTION`
  * Apollo Gateway observes the required [core feature](https://specs.apollo.dev/) versions (like [join](https://specs.apollo.dev/join/v0.1/)) and uses the appropriate implementation.

* For the latest Federation 2 release info see the `CHANGELOG.md` in each sub-project on the [main branch](https://github.com/apollographql/federation).

* Let us know what you think on the [Community Forum](https://community.apollographql.com/t/announcing-apollo-federation-2/1821)

### Gateway Enhancements

* Improved Gateway performance via new op-shape-based field usage reporting
  * With [Apollo Server 3.6+ expensive subgraph traces are not needed](https://www.apollographql.com/docs/apollo-server/api/plugin/usage-reporting/#fieldlevelinstrumentation) for field usage reporting.
  * Set `fieldLevelInstrumentation` to 0.01 to sample 1% of requests for detailed field statistics.
  * Use `fieldLevelInstrumentation` for trace sampling instead of includeRequest for performance.

* Improved Gateway performance with connection pooling for subgraph fetches by default
  * Ensure fetcher in `RemoteGraphQLDatasource` uses connection pooling / keep-alive.
  * `make-fetch-happen` does this by default. significant gains in [our benchmark testing](https://www.apollographql.com/blog/announcement/backend/apollo-router-our-graphql-federation-runtime-in-rust/).
  * [Gateway 2.x uses `make-fetch-happen` by default](https://github.com/apollographql/federation/pull/1284); [backported to Gateway 0.46](https://github.com/apollographql/federation/blob/version-0.x/gateway-js/CHANGELOG.md#v0460)

  * Replace `serviceList` API with more flexible, reactive option - [#1180](https://github.com/apollographql/federation/issues/1180)

### Federation 1

* Originally [released in 2019](https://www.apollographql.com/blog/announcement/apollo-federation-f260cf525d21/), Federation powers some of the largest graphs in the world.
* Some notable additions:
  * skip fetches when possible (based on `@skip` and `@include` usages)
  * `@tag` supported on subgraphs and composed into supergraphs - see [https://specs.apollo.dev/](https://specs.apollo.dev/)
  * `@inaccessible` support on supergraphs
* For the latest Federation 1 release info see the `CHANGELOG.md` in each sub-project on the [version-0.x branch](https://github.com/apollographql/federation/tree/version-0.x).

### Subgraph Compatibility Test Results

* [Over 12 languages and GraphQL frameworks](https://www.apollographql.com/docs/federation/other-servers/) support acting as a subgraph in a federated graph.
* Their support is tracked in Apollo's [subgraph compatibility repository](https://github.com/apollographql/apollo-federation-subgraph-compatibility).
* See [Subgraph Library Maintainer Support](https://community.apollographql.com/t/apollo-federation-subgraph-library-maintainer-support/1112) to learn more.
