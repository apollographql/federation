---
"@apollo/composition": patch
"@apollo/federation-internals": patch
"@apollo/gateway": patch
"@apollo/query-graphs": patch
"@apollo/query-planner": patch
---

Allow `graphql` v17 as a peer dependency (`^16.5.0 || ^17.0.0`), so these packages can be used with either Apollo Server 5 or the forthcoming Apollo Server 6, which will require graphql v17.
