---
"@apollo/query-planner": patch
"@apollo/federation-internals": patch
---

Fix issues in code to reuse named fragments. One of the fixed issue would manifest as an assertion error with a message
looking like `Cannot add fragment of condition X (...) to parent type Y (...)`. Another would manifest itself by
generating an invalid subgraph fetch where a field conflicts with another version of that field that is in a reused
named fragment.
  