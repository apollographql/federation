---
"@apollo/query-planner": patch
"@apollo/query-graphs": patch
"@apollo/federation-internals": patch
---

Fixed missing referenced variables in the `variableUsages` field of fetch operations

Query variables used in fetch operation should be listed in the `variableUsages` field. However, there was a bug where variables referenced by query-level directives could be missing in the field.
