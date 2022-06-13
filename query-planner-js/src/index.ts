export { queryPlanSerializer, astSerializer } from './snapshotSerializers';
export { prettyFormatQueryPlan } from './prettyFormatQueryPlan';

export * from './QueryPlan';
import { QueryPlan } from './QueryPlan';

import { Schema, Operation, Concrete } from '@apollo/federation-internals';
import { buildFederatedQueryGraph, QueryGraph } from "@apollo/query-graphs";
import { computeQueryPlan } from './buildPlan';
import { enforceQueryPlannerConfigDefaults, QueryPlannerConfig } from './config';


export type QPOptions = {
  // Side-note: implemented as an object instead of single boolean because we expect to add more to this soon
  // enough. In particular, once defer-passthrough to subgraphs is implemented, the idea would be to add a
  // new `passthroughSubgraphs` option that is the list of subgraph to which we can pass-through some @defer
  // (and it would be empty by default). Similarly, once we support @stream, grouping the options here will
  // make sense too.
  deferStreamSupport?: {
    /**
     * Enables @defer support by the query planner.
     *
     * If set, then the query plan for queries having some @defer will contains some `DeferNode` (see `QueryPlan.ts`).
     *
     * Defaults to false (meaning that the @defer are ignored).
     */
    enableDefer?: boolean,
  }
}

export class QueryPlanner {
  private readonly config: Concrete<QueryPlannerConfig>;
  private readonly federatedQueryGraph: QueryGraph;

  constructor(
    public readonly supergraphSchema: Schema,
    config?: QueryPlannerConfig
  ) {
      this.config = enforceQueryPlannerConfigDefaults(config);
      this.federatedQueryGraph = buildFederatedQueryGraph(supergraphSchema, true);
  }

  buildQueryPlan(operation: Operation): QueryPlan {
    if (operation.selectionSet.isEmpty()) {
      return { kind: 'QueryPlan' };
    }

    return computeQueryPlan({
      config: this.config,
      supergraphSchema: this.supergraphSchema,
      federatedQueryGraph: this.federatedQueryGraph,
      operation,
    });
  }
}
