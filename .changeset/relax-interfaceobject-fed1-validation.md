---
"@apollo/federation-internals": minor
---

Relax `@interfaceObject` validation for Fed 1 subgraphs

Previously, any use of `@interfaceObject` in a Fed 2 subgraph caused an `INTERFACE_OBJECT_USAGE_ERROR` if any Fed 1 subgraph was present in the composition, regardless of whether the types conflicted.

The check is now per-type: an error is only raised when a Fed 2 subgraph uses `@interfaceObject` on type `T` **and** a Fed 1 subgraph has `@key` on an interface also named `T`. `@key` on an interface in a Fed 1 subgraph does not mean it can fulfill the `__typename`-resolution requirement that `@interfaceObject` depends on — but they are otherwise compatible with `@interfaceObject` usage on unrelated types.
