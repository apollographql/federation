---
"@apollo/query-planner": patch
"@apollo/gateway": patch
---

Fix some potentially incorrect query plans with `@requires` when some dependencies are involved.

In some rare case of `@requires`, an over-eager optimisation was incorrectly considering that
a dependency between 2 subgraph fetches was unnecessary, leading to doing 2 subgraphs queries
in parallel when those should be done sequentially (because the 2nd query rely on results
from the 1st one). This effectively resulted in the required fields not being provided (the
consequence of which depends a bit on the resolver detail, but if the resolver expected
the required fields to be populated (as they should), then this could typically result
in a message of the form `GraphQLError: Cannot read properties of null`).
  
