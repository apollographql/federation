---
"@apollo/composition": patch
"@apollo/federation-internals": patch
---

Stricter merge rules for @requiresScopes and @policy

Current merge policies for `@authenticated`, `@requiresScopes` and `@policy` were inconsistent.

If a shared field uses the same authorization directives across subgraphs, composition merges them using `OR` logic. However, if a shared field uses different authorization directives across subgraphs composition merges them using `AND` logic. This simplified schema evolution, but weakened security requirements. Therefore, the behavior has been changed to always apply `AND` logic to authorization directives applied to the same field across subgraphs.

Since `@policy` and `@requiresScopes` values represent boolean conditions in Disjunctive Normal Form, we can merge them conjunctively to get the final auth requirements. For example:

```graphql
# subgraph A
type T @authenticated {
  # requires scopes (A1 AND A2) OR A3
  secret: String @requiresScopes(scopes: [["A1", "A2"], ["A3"]])
}

# subgraph B
type T {
  # requires scopes B1 OR B2
  secret: String @requiresScopes(scopes: [["B1"], ["B2"]]
}

# composed supergraph
type T @authenticated {
  secret: String @requiresScopes(
    scopes: [
      ["A1", "A2", "B1"],
      ["A1", "A2", "B2"],
      ["A3", "B1"],
      ["A3", "B2"]
    ])
}
```

This algorithm also deduplicates redundant requirements, e.g.

```graphql
# subgraph A
type T {
  # requires A1 AND A2 scopes to access
  secret: String @requiresScopes(scopes: [["A1", "A2"]])
}

# subgraph B
type T {
  # requires only A1 scope to access
  secret: String @requiresScopes(scopes: [["A1"]])
}

# composed supergraph
type T {
  # requires only A1 scope to access as A2 is redundant
  secret: String @requiresScopes(scopes: [["A1"]])
}
```