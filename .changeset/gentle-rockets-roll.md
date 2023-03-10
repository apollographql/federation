---
"@apollo/federation-internals": patch
"@apollo/gateway": patch
---

Handle defaulted variables correctly during post-processing.

Users who tried to use built-in conditional directives (skip/include) with _defaulted_ variables and no variable provided would encounter an error thrown by operation post-processing saying that the variables weren't provided. The defaulted values went unaccounted for, so the operation would validate but then fail an assertion while resolving the conditional.

With this change, defaulted variable values are now collected and provided to post-processing (with defaults being overwritten by variables that are actually provided).
  