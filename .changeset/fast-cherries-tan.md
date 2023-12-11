---
"@apollo/query-planner": patch
---

Add a limit to the number of options for a selection. In some cases, we will generate a lot of possible paths to access a field. There is a process to remove redundant paths, but when the list is too large, that process gets very expensive. To prevent that, we introduce an optional limit that will reject the query if too many paths are generated
