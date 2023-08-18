---
"@apollo/query-planner": patch
"@apollo/federation-internals": patch
---

Fix potential assertion error for named fragment on abstract types when the abstract type does not have the same
possible runtime types in all subgraphs.

The error manifested itself during query planning with an error message of the form `Cannot normalize X at Y ...`.
  