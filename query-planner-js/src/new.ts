export { queryPlanSerializer, astSerializer } from './snapshotSerializers';
export { prettyFormatQueryPlan } from './prettyFormatQueryPlan';

export * from './QueryPlan';
import { QueryPlan } from './QueryPlan';

export * from './composedSchema';
import {
  BuildQueryPlanOptions,
  buildOperationContext,
  OperationContext,
} from './buildQueryPlan';
import { computeQueryPlan } from './buildPlan';
import { Schema, operationFromAST } from '@apollo/core';
import { Graph } from '@apollo/query-graphs';
export { BuildQueryPlanOptions, buildOperationContext };

export * from './buildPlan';

export class NewQueryPlanner {
  constructor(public readonly supergraphSchema: Schema, public readonly queryGraph: Graph) {}

  buildQueryPlan(
    operationContext: OperationContext,
    _options?: BuildQueryPlanOptions,
  ): QueryPlan {
    const operation = operationFromAST(this.supergraphSchema, operationContext.operation, new Map(Object.entries(operationContext.fragments)));
    const queryPlan = computeQueryPlan(this.supergraphSchema, this.queryGraph, operation);
    return queryPlan;
  }
}
