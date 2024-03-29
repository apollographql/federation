---
"@apollo/query-planner": patch
---

Type conditioned fetching

When querying a field that is in a path of 2 or more unions, the query planner was not able to handle different selections and would aggressively collapse selections in fetches yielding an incorrect plan.

This change introduces new syntax to express type conditions in (key and flatten) paths. Type conditioned fetching can be enabled through a flag, and execution is supported in the router only. (#2938)
