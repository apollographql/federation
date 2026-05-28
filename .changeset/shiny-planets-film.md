---
"@apollo/composition": patch
---

Suppress false INCONSISTENT_INTERFACE_VALUE_TYPE_FIELD hints for `@interfaceObject`

Skip the inconsistent value type field hint when a source is an `@interfaceObject` (which only contributes specific fields) or when the field is provided by an `@interfaceObject` in another subgraph (since non-`@interfaceObject` subgraphs are not expected to define those fields).
