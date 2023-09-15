---
"@apollo/query-planner": patch
"@apollo/gateway": patch
---

Don't preserve useless fetches which downgrade __typename from a concrete type back to its interface type.

In certain cases, the query planner was preserving some fetches which were "useless" that would rewrite __typename from its already-resolved concrete type back to its interface type. This could result in (at least) requested fields being "filtered" from the final result due to the interface's __typename in the data where the concrete type's __typename was expected.

Specifically, the solution was compute the path between newly created groups and their parents when we know that it's trivial (`[]`). Further along in the planning process, this allows to actually remove the known-useless group.
  