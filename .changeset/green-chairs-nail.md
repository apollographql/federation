---
"@apollo/composition": patch
"@apollo/federation-internals": patch
---

Include default deprecation reason in the composed supergraph

`@deprecated` reason used to be optional so if a subgraph does not specify the reason, it is omitted from the supergraph
schema. [Reason is no longer optional](https://github.com/graphql/graphql-spec/pull/1040) so we should always include it
(even if it has a default value).