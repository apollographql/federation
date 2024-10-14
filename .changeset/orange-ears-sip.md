---
"@apollo/query-graphs": patch
---

When eliminating suboptimal indirect paths during query planning, properly check for a direct `@key` edge at the end of the potential direct path.
