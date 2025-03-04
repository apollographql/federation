---
"@apollo/query-planner": minor
"@apollo/gateway": minor
---

Query planner now has support to automatically abort query plan requests that take longer than a configured amount of time. Default value is 2 minutes. Value is set by `maxQueryPlanningTime` value in `QueryPlannerConfig` options.
