import prettyFormat from 'pretty-format';
import { QueryPlan } from '.';
import { astSerializer, queryPlanSerializer } from './snapshotSerializers';

export function prettyFormatQueryPlan(queryPlan: QueryPlan) {
  return prettyFormat(queryPlan, {
    plugins: [queryPlanSerializer, astSerializer],
  });
}
