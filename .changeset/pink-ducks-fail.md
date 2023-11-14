---
"@apollo/query-planner": patch
---

removeInputsFromSelection is tasked with removing inputs to a FetchGroup from the fetch group so that we don't retrieve the same values twice (and FetchGroups that don't functionally do anything can be removed). There was a bug in the code that meant that in certain cases, things that were required were actually being removed. This could manifest in subgraph jumps not being possible because the key it was using to make the jump was not available.
  