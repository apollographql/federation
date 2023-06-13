---
"@apollo/query-planner": patch
"@apollo/query-graphs": patch
---

Fix query planner heuristic that could lead to ignoring some valid option and yielding a non-optimal query plan.
  