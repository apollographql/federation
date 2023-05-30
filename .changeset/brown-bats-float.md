---
"@apollo/query-planner": patch
"@apollo/composition": patch
"@apollo/federation-internals": patch
"@apollo/gateway": patch
---

Re-work the code use to try to reuse query named fragments to improve performance (thus sometimes improving query
planning performance), to fix a possibly raised assertion error (with a message of form like `Cannot add selection of
field X to selection set of parent type Y`), and to fix a rare issue where an interface or union field was not being
queried for all the types it should be.
