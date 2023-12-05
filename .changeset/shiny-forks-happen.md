---
"@apollo/query-graphs": patch
---

fix: handle directive conditions on fragments when building query graphs

This fix addresses issues with handling fragments when they specify directive conditions:
* when exploding the types we were not propagating directive conditions
* when processing fragment that specifies super type of an existing type and also specifies directive condition, we were incorrectly preserving the unnecessary type condition. This type condition was problematic as it could be referencing types from supergraph that were not available in the local schema. Instead, we now drop the redundant type condition and only preserve the directives (if specified).  
