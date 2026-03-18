---
"@apollo/composition": patch
"@apollo/federation-internals": patch
---

Mark connect/v0.4 as a preview version so composition does not inject it into the supergraph `@link` unless a subgraph explicitly uses it. Previously, upgrading to Federation v2.13 would unconditionally stamp `connect/v0.4` into the supergraph, causing Router to require the `connectors.preview_connect_v0_4` flag even when no subgraph used v0.4 features. (RH-1321)
