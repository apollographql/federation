---
"@apollo/query-graphs": patch
---

Reduce query graph construction time and retained memory by reusing root followup lists, storing per-edge state in dense arrays, and sharing immutable root transitions. This improves composition and query planner construction for schemas with many root transitions, including connector-expanded schemas.
