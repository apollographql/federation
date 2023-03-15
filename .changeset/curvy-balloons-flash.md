---
"@apollo/composition": patch
"@apollo/gateway": patch
"@apollo/federation-internals": patch
"@apollo/query-graphs": patch
"@apollo/query-planner": patch
---

Refactor the internal implementation of selection sets used by the query planner to decrease the code complexity and
improve query plan generation performance in many cases.
  