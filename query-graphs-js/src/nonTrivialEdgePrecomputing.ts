import { assert } from "@apollo/federation-internals";
import { Edge, QueryGraph, QueryGraphState, simpleTraversal } from "./querygraph";

export function preComputeNonTrivialFollowupEdges(graph: QueryGraph): (previousEdge: Edge) => readonly Edge[] {
  const state = new QueryGraphState<undefined, readonly Edge[]>(graph);
  simpleTraversal(graph, () => {}, (edge) => {
    const followupEdges = graph.outEdges(edge.tail);
    state.setEdgeState(edge, computeNonTrivialFollowups(edge, followupEdges));
    return true;
  });
  return (previousEdge) => {
    const nonTrivialFollowups = state.getEdgeState(previousEdge);
    assert(nonTrivialFollowups, () => `Non-trivial followup edges of ${previousEdge} should have been computed`);
    return nonTrivialFollowups;
  }
}

function computeNonTrivialFollowups(edge: Edge, allFollowups: readonly Edge[]): readonly Edge[] {
  switch (edge.transition.kind) {
    case 'KeyResolution':
      // After taking a key from subgraph A to B, there is no point of following that up with another key
      // to subgraph C if that key has _the same_ conditions. This is because, due to the way key edges
      // are created, if we have a key (with some conditions X) from B to C, then we are guaranteed to
      // also have a key (with the same conditions X) from A to C, and so it's that later key we
      // should be using in the first place. In other words, it's never better to do 2 hops rather than 1.
      return allFollowups.filter((followup) => followup.transition.kind !== 'KeyResolution' || !sameConditions(edge, followup));
    case 'RootTypeResolution':
      // A 'RootTypeResolution' means that a query reached the query type (or another root type) in some
      // subgraph A and we're looking at jumping to another subgraph B. But like for keys, there is
      // no point in trying to jump directly to yet another subgpraph C from B, since we can always
      // jump directly from A to C and it's better.
      return allFollowups.filter((followup) => followup.transition.kind !== 'RootTypeResolution');
    case 'SubgraphEnteringTransition':
      // This is somewhat similar to 'RootTypeResolution' except that we're starting the query.
      // But still, not doing "start of query" -> B -> C, since we can do "start of query" -> C
      // and that's always better.
      return allFollowups.filter((followup) => followup.transition.kind !== 'RootTypeResolution');
    default:
      return allFollowups;
  }
}

function sameConditions(e1: Edge, e2: Edge): boolean {
  if (!e1.conditions) {
    return !e2.conditions;
  }
  return !!e2.conditions && e1.conditions.equals(e2.conditions);
}
