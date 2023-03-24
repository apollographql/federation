---
"@apollo/query-planner": patch
"@apollo/federation-internals": patch
"@apollo/gateway": patch
---

Improves reuse of named fragments in subgraph fetches. When a question has named fragments, the code tries to reuse
those fragment in subgraph fetches is those can apply (so when the fragment is fully queried in a single subgraph fetch).
However, the existing was only able to reuse those fragment in a small subset of cases. This change makes it much more
likely that _if_ a fragment can be reused, it will be.
  
