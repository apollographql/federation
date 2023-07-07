---
"@apollo/federation-internals": patch
---

Fix issue in the code to reuse fragments that, in some rare circumstances, could led to invalid queries where a named
spread was use in an invalid position. If triggered, this resulted in an subgraph fetch whereby a named spread was
used inside a sub-selection even though the spread condition did not intersect the parent type (the exact error message
would depend on the client library used to handle subgraph fetches, but with GraphQL-js, the error message had the
form "Fragment <F> cannot be spread here as objects of type <X> can never be of type <Y>").
  