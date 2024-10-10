---
"@apollo/query-planner": patch
"@apollo/query-graphs": patch
---

Fixes edge case where contextual arguments can yield inefficient query plans. Also fixes naming of query plan arguments which can be a problem when using contextual variables in multiple subgraphs
