---
"@apollo/federation-internals": patch
"@apollo/query-planner": patch
---

Fixed a bug that `__typename` with applied directives gets lost in fetch operations.

The sibling typename optimization used by query planner simplifies operations by folding `__typename` selections into their sibling selections. However, that optimization does not account for directives or aliases. The bug was applying the optimization even if the `__typename` has directives on it, which caused the selection to lose its directives. Now, `__typename` with directives (or aliases) are excluded from the optimization.
