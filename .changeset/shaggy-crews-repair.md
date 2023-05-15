---
"@apollo/query-planner": patch
---

Fix potential assertion error during query planning in some multi-field `@requires` case. This error could be triggered
when a field in a `@requires` depended on another field that was also part of that same requires (for instance, if a
field has a `@requires(fields: "id otherField")` and that `id` is also a key necessary to reach the subgraph providing
`otherField`).

The assertion error thrown in that case contained the message `Root groups (...) should have no remaining groups unhandled (...)`
  
