import { ExecutionResult, parse } from 'graphql';
import { QueryPlanner } from '@apollo/query-planner';

import { buildSchema, operationFromDocument } from '@apollo/federation-internals';
import { ObjMap } from 'graphql/jsutils/ObjMap';

export function plan(
  schemaString: string,
  operationString: string,
  operationName?: string,
): ExecutionResult<ObjMap<any>> {
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
