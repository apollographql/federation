---
"@apollo/federation-internals": patch
"@apollo/query-planner": patch
---

Fixed a bug that `__typename` with applied directives gets lost in fetch operations.

The query planner uses a technique called sibling typename optimization to simplify operations by folding __typename selections into a sibling selection. However, that optimization does not account for applied directives or aliasing. The bug was applying it even if the `__typename` has directives applied. `__typename` with directives (or alias) are now excluded from the optimization.
