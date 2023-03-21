---
"@apollo/federation-internals": patch
---

Fix assertion error during query planning in some cases where queries has some unsatisfiable branches (a part of the
query goes through type conditions that no runtime types satisfies).
  