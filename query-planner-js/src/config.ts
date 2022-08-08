import { Concrete } from "@apollo/federation-internals";

export type QueryPlannerConfig = {
  exposeDocumentNodeInFetchNode?: boolean;

  /**
   * Whether the query planner should try to reused the named fragments of the planned query in subgraph fetches.
   *
   * This is often a good idea as it can prevent very large subgraph queries in some cases (named fragments can
   * make some relatively small queries (using said fragments) expand to a very large query if all the spreads
   * are inline). However, due to architecture of the query planner, this optimization is done as an additional
   * pass on the subgraph queries of the generated plan and can thus increase the latency of building a plan.
   * As long as query plans are sufficiently cached, this should not be a problem, which is why this option is
   * enabled by default, but if the distribution of inbound queries prevents efficient caching of query plans,
   * this may become an undesirable trade-off and cand be disabled in that case.
   *
   * Defaults to true.
   */
  reuseQueryFragments?: boolean,

  // Side-note: implemented as an object instead of single boolean because we expect to add more to this soon
  // enough. In particular, once defer-passthrough to subgraphs is implemented, the idea would be to add a
  // new `passthroughSubgraphs` option that is the list of subgraph to which we can pass-through some @defer
  // (and it would be empty by default). Similarly, once we support @stream, grouping the options here will
  // make sense too.
  deferStreamSupport?: {
    /**
     * Enables @defer support by the query planner.
     *
     * If set, then the query plan for queries having some @defer will contains some `DeferNode` (see `QueryPlan.ts`).
     *
     * Defaults to false (meaning that the @defer are ignored).
     */
    enableDefer?: boolean,
  }
}

export function enforceQueryPlannerConfigDefaults(
  config?: QueryPlannerConfig
): Concrete<QueryPlannerConfig> {
  return {
    exposeDocumentNodeInFetchNode: true,
    reuseQueryFragments: true,
    deferStreamSupport: {
      enableDefer: false,
    },
    ...config,
  };
}
