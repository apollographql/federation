---
"@apollo/query-planner": minor
"@apollo/composition": minor
"@apollo/federation-internals": minor
"@apollo/gateway": minor
---

Introduce the new `@requiresScopes` directive for composition

> Note that this directive will only be _fully_ supported by the Apollo Router as a GraphOS Enterprise feature at runtime. Also note that _composition_ of valid `@requiresScopes` directive applications will succeed, but the resulting supergraph will not be _executable_ by the Gateway or an Apollo Router which doesn't have the GraphOS Enterprise entitlement.

Users may now compose `@requiresScopes` applications from their subgraphs into a supergraph. This addition will support a future version of Apollo Router that enables scoped access to specific types and fields via directive applications.

The directive is defined as follows:

```graphql
directive @requiresScopes on
  | FIELD_DEFINITION
  | OBJECT
  | INTERFACE
  | SCALAR
  | ENUM
```

In order to compose your `@requiresScopes` usages, you must update your subgraph's federation spec version to v2.5 and add the `@requiresScopes` import to your existing imports like so:
```graphql
@link(url: "https://specs.apollo.dev/federation/v2.5", import: [..., "@requiresScopes"])
```