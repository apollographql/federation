---
"@apollo/query-planner": patch
"@apollo/federation-internals": patch
---

Fix assertion error in some overlapping fragment cases. In some cases, when fragments overlaps on some sub-selections
and some interface field implementation relied on sub-typing, an assertion error could be raised with a message of
the form `Cannot add selection of field X to selection set of parent type Y` and this fixes this problem.
  