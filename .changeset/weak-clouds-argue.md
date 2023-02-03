---
"@apollo/gateway": patch
"@apollo/query-planner": patch
---

Fix issue where the query planner was incorrectly not querying `__typename` in a subgraph fetch when `@interfaceObject` is involved
  
