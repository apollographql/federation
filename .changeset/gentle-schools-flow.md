---
"apollo-federation-integration-testsuite": patch
"@apollo/composition": patch
"@apollo/federation-internals": patch
"@apollo/gateway": patch
---

Fixed print logic when calculating the max number of elements to include in the message. Previously we were not passing
the current calculated length correctly leading to inclusion of additional elements in the error/hints message.
