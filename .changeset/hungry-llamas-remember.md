---
"@apollo/query-planner": minor
"@apollo/query-graphs": minor
"@apollo/composition": minor
"@apollo/federation-internals": minor
"@apollo/gateway": minor
---

Implement new directives to allow getting and setting context. This allows resolvers to reference and access data referenced by entities that exist in the GraphPath that was used to access the field. The following example demonstrates the ability to access the `prop` field within the Child resolver.

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
