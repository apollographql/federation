---
"@apollo/composition": patch
"@apollo/query-planner": patch
"@apollo/query-graphs": patch
---

Query graph caches now use maps instead of sparsely-populated arrays for per-subgraph data.
