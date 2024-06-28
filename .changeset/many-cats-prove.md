---
"@apollo/federation-internals": patch
---

For very large graphs cloning types with lots of join directives can be expensive. Since these directives will not be used in the Schema that is cloned for toAPISchema(), add the ability to optionally omit them
