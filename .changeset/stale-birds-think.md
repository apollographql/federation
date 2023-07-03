---
"@apollo/federation-internals": patch
---

Fix regression in named fragment reuse introduced by 2.4.8 that caused fragments that were only used by other fragments
to not be reused, even if they are making the overall query smaller and thus should be reused.
  