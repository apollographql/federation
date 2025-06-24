---
"@apollo/composition": patch
"@apollo/query-graphs": patch
---

Fix bug in composition where, when a field's type in a subgraph is a subtype of the field's type in the supergraph, the satisfiability validation spuriously succeeds/errors.
