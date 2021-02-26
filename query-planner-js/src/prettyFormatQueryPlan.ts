import { QueryPlan } from './';
import prettyFormat from 'pretty-format';
import { astSerializer, queryPlanSerializer } from './snapshotSerializers';

export function prettyFormatQueryPlan(queryPlan: QueryPlan) {
  return prettyFormat(queryPlan, {
    plugins: [queryPlanSerializer, astSerializer],
  });
}
