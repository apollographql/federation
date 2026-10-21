---
"@apollo/query-graphs": patch
---

Reduce query planning time and temporary allocations by indexing field edges per vertex and deferring edge filtering for unused path diagnostics. Preserve candidate order, field applicability checks, and failure diagnostics.
