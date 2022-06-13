import { Concrete } from "@apollo/federation-internals";

export type QueryPlannerConfig = {
  exposeDocumentNodeInFetchNode?: boolean;

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
    deferStreamSupport: {
      enableDefer: false,
    },
    ...config,
  };
}
