---
"@apollo/query-planner": patch
"@apollo/subgraph": patch
"@apollo/gateway": patch
---

Fix specific case for requesting __typename on interface entity type

In certain cases, when resolving a __typename on an interface entity (due to it actual being requested in the operation), that fetch group could previously be trimmed / treated as useless. At a glance, it appears to be a redundant step, i.e.:
```
{ ... on Product { __typename id }} => { ... on Product { __typename} }
```
It's actually necessary to preserve this in the case that we're coming from an interface object to an (entity) interface so that we can resolve the concrete __typename correctly.
  