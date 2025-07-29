---
"@apollo/query-planner": patch
---

Fix bug in query planning when a subgraph jump for @requires can sometimes try to fetch @key fields from a subgraph that doesn't have them.
