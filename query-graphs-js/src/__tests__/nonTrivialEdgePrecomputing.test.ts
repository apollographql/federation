import { composeServices } from '@apollo/composition';
import { Supergraph } from '@apollo/federation-internals';
import { buildFederatedQueryGraph, simpleTraversal } from '@apollo/query-graphs';
import { parse } from 'graphql';

describe('non-trivial root followups', () => {
  test('preserves edge order and shares readonly followups for both incoming root transitions', () => {
    const services = Array.from({ length: 12 }, (_, i) => ({
      name: `s${i}`,
      typeDefs: parse(`
        type Query { f${i}: T }
        type T @key(fields: "id") @key(fields: "sku") {
          id: ID!
          sku: String!
          f${i}: String
        }
      `),
    }));
    const merged = composeServices(services, { runSatisfiability: false });
    if (merged.errors) throw merged.errors[0];
    const graph = buildFederatedQueryGraph(Supergraph.build(merged.supergraphSdl), true);
    const roots = new Map<number, readonly unknown[]>();
    const transitionCounts = new Map<string, number>();
    simpleTraversal(graph, () => undefined, edge => {
      const actual = graph.nonTrivialFollowupEdges(edge);
      const all = graph.outEdges(edge.tail);
      let expected = all;
      if (edge.transition.kind === 'RootTypeResolution' || edge.transition.kind === 'SubgraphEnteringTransition') {
        expected = all.filter(e => e.transition.kind !== 'RootTypeResolution');
        const prior = roots.get(edge.tail.index);
        if (prior) expect(actual).toBe(prior);
        else roots.set(edge.tail.index, actual);
      } else if (edge.transition.kind === 'KeyResolution') {
        expected = all.filter(e => e.transition.kind !== 'KeyResolution' || !(
          edge.conditions ? !!e.conditions && edge.conditions.equals(e.conditions) : !e.conditions
        ));
      }
      expect(actual).toEqual(expected);
      expect(actual.every(e => !e.isKeyOrRootTypeEdgeToSelf())).toBe(true);
      transitionCounts.set(edge.transition.kind, (transitionCounts.get(edge.transition.kind) ?? 0) + 1);
      return true;
    });
    expect(transitionCounts.get('SubgraphEnteringTransition')).toBe(12);
    expect(transitionCounts.get('RootTypeResolution')).toBeGreaterThan(12);
    expect(transitionCounts.get('KeyResolution')).toBeGreaterThan(12);
  });
});
