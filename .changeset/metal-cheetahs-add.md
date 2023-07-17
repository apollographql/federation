---
"@apollo/query-planner": patch
"@apollo/federation-internals": patch
"@apollo/gateway": patch
---

Revert #2639 from v2.4.9

PR #2639 attempts to resolve issues with query fragment reuse, but we've since turned up multiple issues (at least 1 of which is a regression - see #2680. For now, this reverts it until we resolve the regression for a future patch release.
  