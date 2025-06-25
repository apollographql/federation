---
"@apollo/federation-internals": patch
"@apollo/subgraph": patch
---

Revert change to @composeDirective definition to specify nullable argument value.

We cannot fix the definition as that would break customers using older versions of `subgraph-js`. Our validations are already verifying that the values are specified.
