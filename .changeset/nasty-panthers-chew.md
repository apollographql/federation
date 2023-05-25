---
"@apollo/query-planner": patch
---

Adds `debug.maxEvaluatedPlans` query planning configuration options. This option limits the maximum number of query plan
that may have to be evaluated during a query planning phase, thus capping the maximum query planning runtime, but at the
price of potentially reducing the optimality of the generated query plan (which may mean slower query executions). This
option is exposed for debugging purposes, but it is recommended to rely on the default in production.
  
