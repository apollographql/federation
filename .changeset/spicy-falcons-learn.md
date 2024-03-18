---
"apollo-federation-integration-testsuite": minor
"@apollo/query-planner": minor
"@apollo/federation-internals": minor
---

Add new `generateQueryFragments` option to query planner config

If enabled, the query planner will extract inline fragments into fragment definitions before sending queries to subgraphs. This can significantly reduce the size of the query sent to subgraphs, but may increase the time it takes to plan the query.
