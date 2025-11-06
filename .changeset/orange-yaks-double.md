---
"@apollo/composition": patch
---

Fixed access control verification of transitive requirements (through `@requires` and/or `@fromContext`) to ensure it works with chains of transitive dependencies.
