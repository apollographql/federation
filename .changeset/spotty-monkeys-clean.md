---
"@apollo/query-planner": patch
"@apollo/federation-internals": patch
"@apollo/gateway": patch
---

Fix potential bug when an `@interfaceObject` type has a `@requires`. When an `@interfaceObject` type has a field with a
`@requires` and the query requests that field only for some specific implementations of the corresponding interface,
then the generated query plan was sometimes invalid and could result in an invalid query to a subgraph (against a
subgraph that rely on `@apollo/subgraph`, this lead the subgraph to produce an error message looking like `"The
_entities resolver tried to load an entity for type X, but no object or interface type of that name was found in the
schema"`).
  