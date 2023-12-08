---
"@apollo/federation-internals": patch
---

Fix query planning bug where `__typename` on interface object types in named fragments can cause query plan execution to fail. ([#2886](https://github.com/apollographql/federation/issues/2886))
