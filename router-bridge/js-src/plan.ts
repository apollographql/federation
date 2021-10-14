import { ExecutionResult, parse } from 'graphql';
import {
  QueryPlanner,
  buildOperationContext,
  BuildQueryPlanOptions,
  buildComposedSchema,
} from '@apollo/query-planner';

export function plan(
  schemaString: string,
  queryString: string,
  options: BuildQueryPlanOptions,
  operationName?: string,
): ExecutionResult {
  try {
    const schema = parse(schemaString);
    const query = parse(queryString);
    const composedSchema = buildComposedSchema(schema);
    const operationContext = buildOperationContext(
      composedSchema,
      query,
      operationName,
    );

    const planner = new QueryPlanner(composedSchema);
    return { data: planner.buildQueryPlan(operationContext, options) };
  } catch (e) {
    return { errors: [e] };
  }
}
