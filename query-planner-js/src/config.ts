export interface QueryPlannerConfig {
  exposeDocumentNodeInFetchNode?: boolean,

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
}
