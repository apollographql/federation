---
"apollo-federation-integration-testsuite": minor
"@apollo/query-planner": minor
"@apollo/query-graphs": minor
"@apollo/composition": minor
"@apollo/federation-internals": minor
"@apollo/gateway": minor
---

Introduce the new `@policy` scope for composition

  > Note that this directive will only be _fully_ supported by the Apollo Router as a GraphOS Enterprise feature at runtime. Also note that _composition_ of valid `@policy` directive applications will succeed, but the resulting supergraph will not be _executable_ by the Gateway or an Apollo Router which doesn't have the GraphOS Enterprise entitlement.
  
  Users may now compose `@policy` applications from their subgraphs into a supergraph. 
  
  The directive is defined as follows:
  
  ```graphql
  scalar federation__Policy
  
  directive @policy(policies: [[federation__Policy!]!]!) on
    | FIELD_DEFINITION
    | OBJECT
    | INTERFACE
    | SCALAR
    | ENUM
  ```
  
  The `Policy` scalar is effectively a `String`, similar to the `FieldSet` type.
  
  In order to compose your `@policy` usages, you must update your subgraph's federation spec version to v2.6 and add the `@policy` import to your existing imports like so:
  ```graphql
  @link(url: "https://specs.apollo.dev/federation/v2.6", import: [..., "@policy"])
  ```
  