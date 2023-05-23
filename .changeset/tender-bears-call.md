---
"@apollo/query-planner": patch
"@apollo/federation-internals": patch
---

Fix possible fragment-related assertion error during query planning. This prevents a rare case where an assertion with a
message of the form `Cannot add fragment of condition X (runtimes: ...) to parent type Y (runtimes: ...)` could fail
during query planning.
  