---
"@apollo/gateway": patch
---

Fix execution error in some cases where aliases are used and some values are `null`.

The error would manifest itself as an `INTERNAL_SERVER_ERROR` with a message of the form `Cannot read properties of null`.
  