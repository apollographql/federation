---
"@apollo/composition": patch
"@apollo/federation-internals": patch
---

Fix transitive auth requirements on `@requires` and `@fromcontext`

Adds new `postMergeValidation` check to ensure that all fields that depends on data from other parts of the supergraph through `@requires` and/or `@fromContext` directives explicitly specify matching `@authenticated`, `@requiresScopes` and/or `@policy` auth requirements, e.g.

```graphql
type T @key(fields: "id") {
  id: ID!
  extra: String @external
  # we need explicit `@authenticated` as it is needed to access extra
  requiresExtra: String @requires(fields: "extra") @authenticated
}

type T @key(fields: "id") {
  id: ID!
  extra: String @authenticated
}
```