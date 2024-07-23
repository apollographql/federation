---
"@apollo/federation-internals": patch
---

When auto-upgrading schemas from fed1, never add @shareable since it's not valid. Just let them fail during composition if there is no @override.
