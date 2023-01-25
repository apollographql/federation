---
"@apollo/gateway": patch
---

Capture non-ftv1 error information in metrics data. This
error information allows the inline trace plugin to correctly
aggregate stats about errors (where no federated trace data
is available) and stop reporting incomplete traces which
are missing unavailable error information.

This PR is a precursor to apollographql/apollo-server#7136
  