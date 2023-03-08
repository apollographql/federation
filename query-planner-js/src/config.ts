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
  },
}

export function enforceQueryPlannerConfigDefaults(
  config?: QueryPlannerConfig
): Concrete<QueryPlannerConfig> {
  return {
    exposeDocumentNodeInFetchNode: false,
    reuseQueryFragments: true,
    cache: new InMemoryLRUCache<QueryPlan>({maxSize: Math.pow(2, 20) * 50 }),
    ...config,
    incrementalDelivery: {
      enableDefer: false,
      ...config?.incrementalDelivery,
    },
    debug: {
      bypassPlannerForSingleSubgraph: false,
      ...config?.debug,
    },
  };
}
