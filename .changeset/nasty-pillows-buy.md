---
"@apollo/query-planner": patch
---

Fix handling of `@interfaceObject` when multiple child query paths are available.

When making copies of `FetchDependencyGraph`s, we were making incomplete copies that were missing `__typename` input rewrite information required for correctly handling `@interfaceObject` resolution.  
