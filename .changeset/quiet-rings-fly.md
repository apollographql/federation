---
"@apollo/query-planner": patch
---

Ensure all useless fetch groups are removed

When removing "useless" fetch nodes/groups we remove them in-place while still iterating over the same list. This leads to potentially skipping processing of some the children fetch nodes, as when we remove nodes we left shift all remaining children but the iterator keeps the old position unchanged effectively skipping next child.
