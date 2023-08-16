---
"@apollo/query-planner": patch
"@apollo/query-graphs": patch
---

More aggressive ignoring of indirect paths from root types when a more direct alternative exists. This optimisation
slightly generalize an existing heuristic of the query planner, allowing it to ignore some known inefficient options
earlier in its process. When this optimisation can be used, this yield faster query plan computation, but by reducing
the number of plans to be consider, this can sometimes prevent the planner to degrade it's output when it consider
there is too many plans to consider, which can result in more optimal query plans too.
  
