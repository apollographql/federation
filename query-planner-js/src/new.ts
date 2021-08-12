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
import { Kind, validate } from 'graphql';
export { BuildQueryPlanOptions, buildOperationContext };

export * from './buildPlan';

export class NewQueryPlanner {
  constructor(public readonly supergraphSchema: Schema, public readonly queryGraph: Graph) {}

  buildQueryPlan(
    operationContext: OperationContext,
    _options?: BuildQueryPlanOptions,
  ): QueryPlan {
    const operationDocument = { kind: Kind.DOCUMENT, definitions: [operationContext.operation, ...Object.values(operationContext.fragments)]};
    const validationErrors = validate(operationContext.schema, operationDocument);

    if (validationErrors.length > 0) {
      throw new Error(validationErrors.map(error => error.message).join("\n\n"));
    }

    const operation = operationFromAST(this.supergraphSchema, operationContext.operation, new Map(Object.entries(operationContext.fragments)));
    const queryPlan = computeQueryPlan(this.supergraphSchema, this.queryGraph, operation);
    return queryPlan;
  }
}
