---
"@apollo/query-planner": patch
"@apollo/composition": patch
"@apollo/federation-internals": patch
---

Fix a query planning bug where invalid subgraph queries are generated with `reuseQueryFragments` set true. ([#2952](https://github.com/apollographql/federation/issues/2952))
