---
"@apollo/query-planner": patch
---

pruneClosedBranches() was more computationally intensive than just running sort on all the branches. This can lead to an order of magnitude speedup on type exploded query plans.
  