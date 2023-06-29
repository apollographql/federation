---
"@apollo/composition": minor
"@apollo/federation-internals": minor
"@apollo/subgraph": minor
"@apollo/gateway": minor
---

Introduce the new `@authenticated` directive for composition

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