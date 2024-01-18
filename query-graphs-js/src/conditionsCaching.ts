import { assert } from "@apollo/federation-internals";
import { ConditionResolution, ConditionResolver, ExcludedConditions, ExcludedDestinations, sameExcludedDestinations } from "./graphPath";
import { PathContext } from "./pathContext";
import { Edge, QueryGraph, QueryGraphState } from "./querygraph";

export function cachingConditionResolver(graph: QueryGraph, resolver: ConditionResolver): ConditionResolver {
  // For every edge having a condition, we cache the resolution its conditions when possible.
  // We save resolution with the set of excluded edges that were used to compute it: the reason we do this is
  // that excluded edges impact the resolution, so we should only used a cached value if we know the excluded
  // edges are the same as when caching, and while we could decide to cache only when we have no excluded edges
  // at all, this would sub-optimal for types that have multiple keys, as the algorithm will always at least
  // include the previous key edges to the excluded edges of other keys. In other words, if we only cached
  // when we have no excluded edges, we'd only ever use the cache for the first key of every type. However,
  // as the algorithm always try keys in the same order (the order of the edges in the query graph), including
  // the excluded edges we see on the first ever call is actually the proper thing to do.
  const cache = new QueryGraphState<undefined, [ConditionResolution, ExcludedDestinations]>(graph);
  return (edge: Edge, context: PathContext, excludedDestinations: ExcludedDestinations, excludedConditions: ExcludedConditions) => {
    assert(edge.conditions, 'Should not have been called for edge without conditions');

    // We don't cache if there is a context or excluded conditions because those would impact the resolution and
    // we don't want to cache a value per-context and per-excluded-conditions (we also don't cache per-excluded-edges though
    // instead we cache a value only for the first-see excluded edges; see above why that work in practice).
    // TODO: we could actually have a better handling of the context: it doesn't really change how we'd resolve the condition, it's only
    // that the context, if not empty, would have to be added to the trigger of key edges in the resolution path tree when appropriate
    // and we currently don't handle that. But we could cache with an empty context, and then apply the proper transformation on the
    // cached value `pathTree` when the context is not empty. That said, the context is about active @include/@skip and it's not use
    // that commonly, so this is probably not an urgent improvement.
    if (!context.isEmpty() || excludedConditions.length > 0) {
      return resolver(edge, context, excludedDestinations, excludedConditions);
    }

    const cachedResolutionAndExcludedEdges = cache.getEdgeState(edge);
    if (cachedResolutionAndExcludedEdges) {
      const [cachedResolution, forExcludedEdges] = cachedResolutionAndExcludedEdges;
      return sameExcludedDestinations(forExcludedEdges, excludedDestinations)
        ? cachedResolution
        : resolver(edge, context, excludedDestinations, excludedConditions);
    } else {
      const resolution = resolver(edge, context, excludedDestinations, excludedConditions);
      cache.setEdgeState(edge, [resolution, excludedDestinations]);
      return resolution;
    }
  };
}
