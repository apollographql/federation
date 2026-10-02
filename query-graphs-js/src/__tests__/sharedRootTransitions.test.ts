import { composeServices } from '@apollo/composition';
import { Supergraph } from '@apollo/federation-internals';
import { buildFederatedQueryGraph, simpleTraversal } from '@apollo/query-graphs';
import { parse } from 'graphql';

test('shares immutable root transitions while preserving destinations and root kinds', () => {
  const services = Array.from({ length: 3 }, (_, i) => ({
    name: `s${i}`,
    typeDefs: parse(`type Query { q${i}: String } type Mutation { m${i}: String } type Subscription { s${i}: String }`),
  }));
  const merged = composeServices(services, { runSatisfiability: false });
  if (merged.errors) throw merged.errors[0];
  const graph = buildFederatedQueryGraph(Supergraph.build(merged.supergraphSdl), false);
  const seen = new Set<number>();
  const kinds = new Set<string>();
  simpleTraversal(graph, () => undefined, edge => {
    if (edge.transition.kind === 'RootTypeResolution' && !seen.has(edge.head.index)) {
      seen.add(edge.head.index);
      const transitions = graph.outEdges(edge.head, true).filter(e => e.transition.kind === 'RootTypeResolution');
      expect(transitions).toHaveLength(3);
      expect(new Set(transitions.map(e => e.tail.source)).size).toBe(3);
      expect(new Set(transitions.map(e => e.transition)).size).toBe(1);
      expect(transitions.some(e => e.isKeyOrRootTypeEdgeToSelf())).toBe(true);
      kinds.add(edge.transition.rootKind);
    }
    return true;
  });
  expect(seen.size).toBe(9);
  expect([...kinds].sort()).toEqual(['mutation', 'query', 'subscription']);
});
