---
"@apollo/query-graphs": patch
---

Reduce composition memory and graph construction work by omitting root transitions during validation when the root type is not used as a value. Preserve those transitions for referenced roots and for query planning, including deferred selections.
