---
"@apollo/federation-internals": patch
---

Fix unnecessary busy work in the code extracting subgraphs from supergraphs. This code is executing when a new
supergraph is deployed, and can impact gateway clients when it runs. This is often not a problem, but for
large supergraphs with lots of subgraphs, an obvious inefficiency could make the code take much longer than
it should have.
  