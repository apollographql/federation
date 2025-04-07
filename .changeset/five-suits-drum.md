---
"@apollo/query-planner": patch
"@apollo/query-graphs": patch
"@apollo/federation-internals": patch
"@apollo/gateway": patch
---

Corrects a set of denial-of-service (DOS) vulnerabilities that made it possible for an attacker to render gateway inoperable with certain simple query patterns due to uncontrolled resource consumption. All prior-released versions and configurations are vulnerable.

See the associated GitHub Advisories [GHSA-q2f9-x4p4-7xmh](https://github.com/apollographql/federation/security/advisories/GHSA-q2f9-x4p4-7xmh) and [GHSA-p2q6-pwh5-m6jr](https://github.com/apollographql/federation/security/advisories/GHSA-p2q6-pwh5-m6jr) for more information.
