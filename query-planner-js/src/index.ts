export { queryPlanSerializer, astSerializer } from './snapshotSerializers';
export { prettyFormatQueryPlan } from './prettyFormatQueryPlan';

export * from './QueryPlan';
import { QueryPlan } from './QueryPlan';

import { Schema, Operation } from '@apollo/federation-internals';
import { buildFederatedQueryGraph, QueryGraph } from "@apollo/query-graphs";
import { computeQueryPlan } from './buildPlan';
import { QueryPlannerConfig } from './config';

export { QueryPlannerConfig } from './config'; 

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
