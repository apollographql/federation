export { queryPlanSerializer, astSerializer } from './snapshotSerializers';
export { prettyFormatQueryPlan } from './prettyFormatQueryPlan';

export * from './QueryPlan';
import { QueryPlan } from './QueryPlan';

import { Schema, Operation } from '@apollo/federation-internals';
import { buildFederatedQueryGraph, QueryGraph } from "@apollo/query-graphs";
import { computeQueryPlan } from './buildPlan';
import { QueryPlannerConfig } from './config';

// There isn't much in this class yet, and I didn't want to make too many
// changes at once, but since we were already storing a pointer to a
// Rust query planner instance in the gateway, I think it makes sense to retain
// that structure. I suspect having a class instead of a stand-alone function
// will come in handy to encapsulate schema-derived data that is used during
// planning but isn't operation specific. The next step is likely to be to
// convert `buildQueryPlan` into a method.
export class QueryPlanner {
  private readonly config: QueryPlannerConfig;
  private readonly federatedQueryGraph: QueryGraph;

  constructor(public readonly supergraphSchema: Schema,
    config?: QueryPlannerConfig) {
      this.config = {
        exposeDocumentNodeInFetchNode: true,
        ...config
      }
      this.federatedQueryGraph = buildFederatedQueryGraph(supergraphSchema, true);
  }

  buildQueryPlan(operation: Operation): QueryPlan {
    if (operation.selectionSet.isEmpty()) {
      return { kind: 'QueryPlan' };
    }

    return computeQueryPlan(this.config, this.supergraphSchema, this.federatedQueryGraph, operation);
  }
}
