---
"@apollo/query-planner": patch
---

Fix query planning bug where keys or required fields can sometimes reach subgraphs with null values. ([#2805](https://github.com/apollographql/federation/issues/2805))
  