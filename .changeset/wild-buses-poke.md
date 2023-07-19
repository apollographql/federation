---
"@apollo/query-planner": patch
"@apollo/federation-internals": patch
"@apollo/gateway": patch
---

Reapply #2639:

Try reusing named fragments in subgraph fetches even if those fragment only apply partially to the subgraph. Before this change, only named fragments that were applying entirely to a subgraph were tried, leading to less reuse that expected. Concretely, this change can sometimes allow the generation of smaller subgraph fetches.

Additionally, resolve a bug which surfaced in the fragment optimization logic which could result in invalid/incorrect optimizations / fragment reuse.
  