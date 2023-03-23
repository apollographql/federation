---
"@apollo/query-planner": patch
"@apollo/query-graphs": patch
"@apollo/federation-internals": patch
"@apollo/gateway": patch
---

Fix issues (incorrectly rejected composition and/or subgraph errors) with `@interfaceObject`. Those issues may occur
either due to some use of `@requires` in an `@interfaceObject` type, or when some subgraph `S` defines a type that is an
implementation of an interface `I` in the supergraph, and there is an `@interfaceObject` for `I` in another subgraph,
but `S` does not itself defines `I`.
