import { Concrete } from "@apollo/federation-internals";
import { QueryPlan } from ".";
import { InMemoryLRUCache, KeyValueCache } from '@apollo/utils.keyvaluecache';

export type QueryPlanCache = KeyValueCache<QueryPlan> & { clear: () => void }

export type QueryPlannerConfig = {
  /**
   * If enabled, the `FetchNode.operationDocumentNode` field in query plan will be populated with the AST
   * of the underlying operation (_on top_ of the "serialized" string `FetchNode.operation` which is always
   * present). This can used by specific gateway user code that needs read-only access to such AST in
   * order to save having to parse `FetchNode.operation`. Without this option, `FetchNode.operationDocumentNode`
   * will always be `undefined`.
   *
   * Enabling this option will make query plans use more memory and you should consider increasing the
   * query plan cache size (though `GatewayConfig.experimental_approximateQueryPlanStoreMiB`) if you enable it.
   *
   * Defaults to false (at least since 2.2; it temporarily defaulted to true before 2.2).
   */
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

  /**
   * If enabled, the query planner will extract inline fragments into fragment
   * definitions before sending queries to subgraphs. This can significantly
   * reduce the size of the query sent to subgraphs, but may increase the time
   * it takes to plan the query.
   */
  generateQueryFragments?: boolean,

  // Side-note: implemented as an object instead of single boolean because we expect to add more to this soon
  // enough. In particular, once defer-passthrough to subgraphs is implemented, the idea would be to add a
  // new `passthroughSubgraphs` option that is the list of subgraph to which we can pass-through some @defer
  // (and it would be empty by default). Similarly, once we support @stream, grouping the options here will
  // make sense too.
  incrementalDelivery?: {
    /**
     * Enables @defer support by the query planner.
     *
     * If set, then the query plan for queries having some @defer will contains some `DeferNode` (see `QueryPlan.ts`).
     *
     * Defaults to false (meaning that the @defer are ignored).
     */
    enableDefer?: boolean,
  }

  cache?: QueryPlanCache,

  /**
   * A sub-set of configurations that are meant for debugging or testing. All the configurations in this
   * sub-set are provided without guarantees of stability (they may be dangerous) or continued support (they
   * may be removed without warning).
   */
  debug?: {
    /**
     * If used and the supergraph is built from a single subgraph, then user queries do not go through the
     * normal query planning and instead a fetch to the one subgraph is built directly from the input query.
     */
    bypassPlannerForSingleSubgraph?: boolean,

    /**
     * Query planning is an exploratory process. Depending on the specificities and feature used by
     * subgraphs, there could exist may different theoretical valid (if not always efficient) plans
     * for a given query, and at a high level, the query planner generates those possible choices,
     * evaluate them, and return the best one. In some complex cases however, the number of
     * theoretically possible plans can be very large, and to keep query planning time acceptable,
     * the query planner cap the maximum number of plans it evaluates. This config allows to configure
     * that cap. Note if planning a query hits that cap, then the planner will still always return a
     * "correct" plan, but it may not return _the_ optimal one, so this config can be considered a
     * trade-off between the worst-time for query planning computation processing, and the risk of
     * having non-optimal query plans (impacting query runtimes).
     *
     * This value currently defaults to 10 000, but this default is considered an implementation
     * detail and is subject to change. We do not recommend setting this value unless it is to
     * debug a specific issue (with unexpectedly slow query planning for instance). Remember that
     * setting this value too low can negatively affect query runtime (due to the use of sub-optimal
     * query plans).
     */
    maxEvaluatedPlans?: number,

    /**
     * Before creating query plans, for each path of fields in the query we compute all the
     * possible options to traverse that path via the subgraphs. Multiple options can arise because
     * fields in the path can be provided by multiple subgraphs, and abstract types (i.e. unions
     * and interfaces) returned by fields sometimes require the query planner to traverse through
     * each constituent object type. The number of options generated in this computation can grow
     * large if the schema or query are sufficiently complex, and that will increase the time spent
     * planning.
     *
     * This config allows specifying a per-path limit to the number of options considered. If any
     * path's options exceeds this limit, query planning will abort and the operation will fail.
     *
     * The default value is null, which specifies no limit.
     */
    pathsLimit?: number | null
  },

   /**
   * Enables type conditioned fetching.
   * This flag is a workaround, which may yield significant
   * performance degradation when computing query plans,
   * and increase query plan size.
   *
   * If you aren't aware of this flag, you probably don't need it.
   */
    typeConditionedFetching?: boolean,
}

export function enforceQueryPlannerConfigDefaults(
  config?: QueryPlannerConfig
): Concrete<QueryPlannerConfig> {
  return {
    exposeDocumentNodeInFetchNode: false,
    reuseQueryFragments: true,
    generateQueryFragments: false,
    cache: new InMemoryLRUCache<QueryPlan>({maxSize: Math.pow(2, 20) * 50 }),
    ...config,
    incrementalDelivery: {
      enableDefer: false,
      ...config?.incrementalDelivery,
    },
    debug: {
      bypassPlannerForSingleSubgraph: false,
      // Note that this number is a tad arbitrary: it's a nice round number that, on my laptop, ensure query planning
      // don't take more than a handful of seconds. It might be worth running a bit more experiments on more environment
      // to see if it's such a good default.
      maxEvaluatedPlans: 10000,
      pathsLimit: null,
      ...config?.debug,
    },
    typeConditionedFetching: config?.typeConditionedFetching || false,
  };
}

export function validateQueryPlannerConfig(
  config: Concrete<QueryPlannerConfig>,
) {
  if (config.debug.maxEvaluatedPlans < 1) {
    throw new Error(`Invalid value for query planning configuration "debug.maxEvaluatedPlans"; expected a number >= 1 but got ${config.debug.maxEvaluatedPlans}`);
  }
}
