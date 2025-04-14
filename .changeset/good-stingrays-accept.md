---
"@apollo/composition": patch
---

Fixes bug introduced in `2.10.0` where we could potentially throw in `hintOnInconsistentEntity` if subgraphs use `@federation__key` rather than `@key`.
