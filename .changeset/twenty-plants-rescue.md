---
"@apollo/composition": patch
"@apollo/federation-internals": patch
---

When `@provides` specifies an overridden field, remove it from the supergraph's selection set so that data is retrieved from the correct subgraph
