---
"@apollo/query-planner": patch
---

Fix issue with missing fragment definitions due to `generateQueryFragments`.

An incorrect implementation detail in `generateQueryFragments` caused certain queries to be missing fragment definitions. Specifically, subsequent fragment "candidates" with the same type condition and the same length of selections as a previous fragment weren't correctly added to the list of fragments. An example of an affected query is:

```graphql
query {
  t {
    ... on A {
      x
      y
    }
  }
  t2 {
    ... on A {
      y
      z
    }
  }
}
```

In this case, the second selection set would be converted to an inline fragment spread to subgraph fetches, but the fragment definition would be missing.
