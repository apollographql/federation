import { astSerializer, FetchNode, PlanNode, queryPlanSerializer, QueryPlanner, QueryPlannerConfig } from '@apollo/query-planner';
import { composeServices } from '@apollo/composition';
import { asFed2SubgraphDocument, buildSchema, Schema, ServiceDefinition } from '@apollo/federation-internals';

expect.addSnapshotSerializer(astSerializer);
expect.addSnapshotSerializer(queryPlanSerializer);

export function composeAndCreatePlanner(...services: ServiceDefinition[]): [Schema, QueryPlanner] {
  return composeAndCreatePlannerWithOptions(services, {});
}

export function composeAndCreatePlannerWithOptions(services: ServiceDefinition[], config: QueryPlannerConfig): [Schema, QueryPlanner] {
  const compositionResults = composeServices(
    services.map((s) => ({ ...s, typeDefs: asFed2SubgraphDocument(s.typeDefs) }))
  );
  expect(compositionResults.errors).toBeUndefined();
  return [
    compositionResults.schema!.toAPISchema(),
    new QueryPlanner(buildSchema(compositionResults.supergraphSdl!), config)
  ];
}

export function findFetchNodes(subgraphName: string, node: PlanNode | undefined): (FetchNode)[] {
  if (!node) {
    return [];
  }

  switch (node.kind) {
    case 'Fetch':
      return node.serviceName === subgraphName ? [node] : [];
    case 'Flatten':
      return findFetchNodes(subgraphName, node.node);
    case 'Defer':
      return findFetchNodes(subgraphName, node.primary?.node).concat(
        node.deferred.flatMap((d) => findFetchNodes(subgraphName, d.node))
      );
    case 'Sequence':
    case 'Parallel':
      return node.nodes.flatMap((n) => findFetchNodes(subgraphName, n));
    case 'Condition':
      return findFetchNodes(subgraphName, node.ifClause).concat(
        findFetchNodes(subgraphName, node.elseClause)
      );
  }
}
