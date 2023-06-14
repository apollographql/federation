---
"@apollo/query-planner": patch
---

Fix bug in the handling of dependencies of subgraph fetches. This bug was manifesting itself as an assertion error
thrown during query planning with a message of the form `Root groups X should have no remaining groups unhandled (...)`.
  