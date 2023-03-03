---
"@apollo/gateway": patch
---

Previously the `queryPlanStoreKey` was a hash of the query concatenated with an unhashed `operationName` if it was present. This resulted in variable length cache keys that could become unnecessarily long, occupying additional space in the query plan cache.

This change incorporates the `operationName` _into_ the hash itself (if `operationName` is present).
  