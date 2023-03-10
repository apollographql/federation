---
"@apollo/query-planner": minor
"@apollo/gateway": minor
---

Adds debug/testing query planner options (`debug.bypassPlannerForSingleSubgraph`) to bypass the query planning
process for federated supergraph having only a single subgraph. The option is disabled by default, is not recommended
for production, and is not supported (it may be removed later). It is meant for debugging/testing purposes.
  
