---
"@apollo/query-planner": minor
"@apollo/query-graphs": minor
"@apollo/composition": minor
"@apollo/federation-internals": minor
"@apollo/subgraph": minor
"@apollo/gateway": minor
---

Implement progressive `@override` functionality

The progressive `@override` feature brings a new argument to the `@override` directive: `label: String`. When a label is added to an `@override` application, the override becomes conditional, depending on parameters provided to the query planner (a set of which labels should be overridden). Note that this feature will be supported in router for enterprise users only.

Out-of-the-box, the router will support a percentage-based use case for progressive `@override`. For example:
```graphql
type Query {
  hello: String @override(from: "original", label: "percent(5)")
}
```
The above example will override the root `hello` field from the "original" subgraph 5% of the time.

More complex use cases will be supported by the router via the use of coprocessors/rhai to resolve arbitrary labels to true/false values (i.e. via a feature flag service).
