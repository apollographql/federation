---
"@apollo/federation-internals": patch
---

Align `@connect` spec with Rust implementation. As per the [docs](https://www.apollographql.com/docs/graphos/schema-design/federated-schemas/reference/versions#v211)
`@connect/v0.2` version should require Apollo Federation v2.11.

There are no `@join` spec differences between Federation v2.10 and v2.11 so this change will not result in any supergraph
changes. This change may result in additional/updated hint messages when `@connect/v0.1` spec is auto-upgraded to `v0.2`
(which may result in auto-upgrading connector virtual subgraph to `v2.11`).
