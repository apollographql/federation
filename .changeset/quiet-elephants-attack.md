---
"@apollo/federation-internals": patch
---

Preserve user-defined `_service` fields

`ignoreParsedField` was stripping any field named `_service` or `_entities` from all types during fed1 schema parsing, but should only strip them from the Query root type where they are federation built-in operations.