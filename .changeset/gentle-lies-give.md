---
"@apollo/composition": minor
"@apollo/federation-internals": minor
---

For CoreSpecDefintions that opt in, we've added the ability to tie the core spec version to a particular federation version. That means that if there's a new version of, say, the join spec, you won't necessarily get the new version in the supergraph schema if no subgraph requires it.
  