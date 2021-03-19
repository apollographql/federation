export { queryPlanSerializer, astSerializer } from './snapshotSerializers';
export { prettyFormatQueryPlan } from './prettyFormatQueryPlan';

export * from './QueryPlan';
import { QueryPlan } from './QueryPlan';

import { buildComposedSchema } from './composedSchema';
import { GraphQLSchema, parse } from 'graphql';
import { buildOperationContext, buildQueryPlan } from './buildQueryPlan';

// We temporarily export the same API we used for the wasm query planner,
// but implemented as a facade on top of the TypeScript one. This is ugly
// and inefficient (we shouldn't be parsing the query again), but the goal
// is to get things working first without making changes to the gateway code.

export type QueryPlannerPointer = {
  composedSchema: GraphQLSchema
};

export function getQueryPlanner(schema: string): QueryPlannerPointer {
  return {
    composedSchema: buildComposedSchema(schema),
  };
}

export function getQueryPlan(
  planner_ptr: QueryPlannerPointer,
  query: string,
  options: any,
): QueryPlan {
  return buildQueryPlan(
    buildOperationContext(planner_ptr.composedSchema, parse(query)),
    options,
  );
}
