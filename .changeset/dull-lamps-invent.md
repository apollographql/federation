---
"@apollo/query-planner": patch
"@apollo/query-graphs": patch
"@apollo/composition": patch
"@apollo/federation-internals": patch
"@apollo/gateway": patch
---

Do not run the full suite of graphQL validations on supergraphs and their extracted subgraphs by default in production environment.

Running those validations on every updates of the schema takes a non-negligible amount of time (especially on large
schema) and mainly only serves in catching bugs early in the supergraph handling code, and in some limited cases,
provide slightly better messages when a corrupted supergraph is received, neither of which is worth the cost in
production environment.

A new `validateSupergraph` option is also introduced in the gateway configuration to force this behaviour.
  