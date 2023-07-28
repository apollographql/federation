---
"@apollo/gateway": patch
---

Remove extraneous call to `span.setStatus()` on a span which has already ended.

In cases where a subgraph responded with an error, we would sometimes try to set
the status of a span which had already ended. This resulted in a warning log to
the console (but no effect otherwise). This warning should no longer happen.
  