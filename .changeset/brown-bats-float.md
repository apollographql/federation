---
"@apollo/query-planner": patch
"@apollo/composition": patch
"@apollo/federation-internals": patch
"@apollo/gateway": patch
---

Improves the performance of the code used to try to reuse query named fragments, thus improving query planning
performance (at least for queries having named fragments).
  