---
"@apollo/subgraph": patch
---

When a `GraphQLScalarType` resolver is provided to `buildSubgraphSchema()`, omitted configuration options in the `GraphQLScalarType` no longer cause the corresponding properties in the GraphQL document/AST to be cleared. To explicitly clear these properties, use `null` for the configuration option instead. ([#3285](https://github.com/apollographql/federation/pull/3285))
