---
"@apollo/query-planner": patch
---

Fix bug in query planning where a subgraph jump for `@requires` can sometimes try to fetch `@key` fields from a subgraph that doesn't have them. This bug would previously cause query planning to error with a message that looks like "Cannot add selection of field `T.id` to selection set of parent type `T`".
