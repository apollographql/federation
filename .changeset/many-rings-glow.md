---
"@apollo/query-planner": patch
"@apollo/query-graphs": patch
---

Fixes a bug where query planning may unexpectedly error due to attempting to generate a plan where a `@shareable` mutation field is called more than once across multiple subgraphs. ([#3304](https://github.com/apollographql/federation/pull/3304))
