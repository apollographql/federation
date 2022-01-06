import { ExecutionResult, parse } from 'graphql';
import { QueryPlanner, QueryPlan } from '@apollo/query-planner';

import { buildSchema, operationFromDocument } from '@apollo/federation-internals';

export function plan(
  schemaString: string,
  operationString: string,
  operationName?: string,
): ExecutionResult<QueryPlan> {
  try {
    const composedSchema = buildSchema(schemaString);
    const operationDocument = parse(operationString);
    const operation =
      operationFromDocument(composedSchema, operationDocument, operationName);

    const planner = new QueryPlanner(composedSchema);
    return { data: planner.buildQueryPlan(operation) };
  } catch (e) {
    return { errors: [e] };
  }
}
