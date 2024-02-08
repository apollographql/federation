---
"@apollo/query-planner": patch
"@apollo/federation-internals": patch
---

When auto-upgrading a subgraph (i.e. one that does not explicitly @link the federation spec) do not go past v2.4. This is so that subgraphs will not inadvertently require the latest join spec (which cause the router or gateway not to start if running an older version).
