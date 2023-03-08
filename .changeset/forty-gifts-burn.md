---
"@apollo/query-planner": minor
"@apollo/gateway": minor
---

This change introduces a configurable query plan cache. This option allows
developers to provide their own query plan cache like so:

```
new ApolloGateway({
  queryPlannerConfig: {
    cache: new MyCustomQueryPlanCache(),
  },
});
```

The current default implementation is effectively as follows:
```
import { InMemoryLRUCache } from "@apollo/utils.keyvaluecache";

const cache = new InMemoryLRUCache<string>({
  maxSize: Math.pow(2, 20) * 30,
  sizeCalculation<T>(obj: T): number {
    return Buffer.byteLength(JSON.stringify(obj), "utf8");
  },
});
```

TypeScript users should implement the `QueryPlanCache` type which is now
exported by `@apollo/query-planner`:
```
import { QueryPlanCache } from '@apollo/query-planner';

class MyCustomQueryPlanCache implements QueryPlanCache {
  // ...
}
```
  