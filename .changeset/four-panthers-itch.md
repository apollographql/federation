---
"@apollo/composition": patch
"@apollo/federation-internals": patch
---

Adding new CompositionOption `maxValidationSubgraphPaths`. This value represents the maximium number of SubgraphPathInfo objects that may exist in a ValidationTraversal when checking for satisfiability. Setting this value can help composition error before running out of memory. Default is 1,000,000.
