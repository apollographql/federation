---
"@apollo/query-planner": patch
"@apollo/federation-internals": patch
---

fix: normalize field set selection sets

`FieldSet` scalar represents a selection set without outer braces. This means that users could potentially specify some selections that could be normalized (i.e. eliminate duplicate field selections, hoist/collapse unnecessary inline fragments, etc). Previously we were using `@requires` field set selection AS-IS for edge conditions. With this change we will now normalize the `FieldSet` selections before using them as fetch node conditions.