---
"@apollo/query-planner": patch
"@apollo/federation-internals": patch
---

Improves the heuristics used to try to reuse the query named fragments in subgraph fetches. Said fragment will be reused
more often, which can lead to smaller subgraph queries (and hence overall faster processing).
  