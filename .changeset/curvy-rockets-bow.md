---
"@apollo/query-planner": patch
"@apollo/federation-internals": patch
---

Fix over-eager merging of fields with different directive applications

Previously, the following query would incorrectly combine the selection set of `hello`, with both fields ending up under the @skip condition:
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
  