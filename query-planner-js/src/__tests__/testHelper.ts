import { astSerializer, FetchNode, PlanNode, queryPlanSerializer, QueryPlanner, QueryPlannerConfig, SubscriptionNode } from '@apollo/query-planner';
import { composeServices } from '@apollo/composition';
import { asFed2SubgraphDocument, Schema, ServiceDefinition, Supergraph } from '@apollo/federation-internals';

expect.addSnapshotSerializer(astSerializer);
expect.addSnapshotSerializer(queryPlanSerializer);

export function composeAndCreatePlanner(...services: ServiceDefinition[]): [Schema, QueryPlanner] {
  return composeAndCreatePlannerWithOptions(services, {}, false);
}

export function composeFed2SubgraphsAndCreatePlanner(...services: ServiceDefinition[]): [Schema, QueryPlanner] {
  return composeAndCreatePlannerWithOptions(services, {}, true);
}

export function composeAndCreatePlannerWithOptions(services: ServiceDefinition[], config: QueryPlannerConfig, isFed2Subgraph: boolean = false): [Schema, QueryPlanner] {
  const updatedServices = isFed2Subgraph ? services : services.map((s) => ({ ...s, typeDefs: asFed2SubgraphDocument(s.typeDefs) }));

  const compositionResults = composeServices(updatedServices);
  expect(compositionResults.errors).toBeUndefined();
  return [
    compositionResults.schema!.toAPISchema(),
    new QueryPlanner(Supergraph.build(compositionResults.supergraphSdl!), config)
  ];
}

export function findFetchNodes(subgraphName: string, node: PlanNode | SubscriptionNode | undefined): FetchNode[] {
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
    case 'Subscription':
      return findFetchNodes(subgraphName, node.primary).concat(
        findFetchNodes(subgraphName, node.rest)
      );
  }
}
