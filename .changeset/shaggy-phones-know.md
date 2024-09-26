---
"@apollo/query-planner": patch
"@apollo/federation-internals": patch
---

Fixes handling of a `__typename` selection during query planning process.

When expanding fragments we were keeping references to the same `Field`s regardless where those fragments appeared in our original selection set. This was generally fine as in most cases we would have same inline fragment selection sets across whole operation but was causing problems when we were applying another optimization by collapsing those expanded inline fragments creating a new selection set. As a result, if any single field selection (within that fragment) would perform optimization around the usage of `__typename`, ALL occurrences of that field selection would get that optimization as well.
