---
"@apollo/query-planner": patch
"@apollo/federation-internals": patch
"@apollo/gateway": patch
---

Fixed several code paths that access response objects to prevent JavaScript prototype pollution and unintended access to the prototype chain.

See the associated GitHub Advisories [GHSA-pfjj-6f4p-rvmh](https://github.com/apollographql/federation/security/advisories/GHSA-pfjj-6f4p-rvmh) for more information.
