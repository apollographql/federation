---
"@apollo/query-graphs": patch
---

Fix bug in context-matching logic for interfaces-implementing-interfaces (#3014)
    
A field is considered to match a context if the field's parent type (in the original query) either has `@context` on it, or implements/is a member of a type with `@context` on it. We ended up missing the case where interfaces implement interfaces; this PR introduces a fix.
