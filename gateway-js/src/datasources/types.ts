import { ResponsePath } from '@apollo/query-planner';
import { GatewayGraphQLResponse, GatewayGraphQLRequestContext } from '@apollo/server-gateway-interface';

export interface GraphQLDataSource<
  TContext extends Record<string, any> = Record<string, any>,
> {
  process(
    options: GraphQLDataSourceProcessOptions<TContext>,
  ): Promise<GatewayGraphQLResponse>;
}

export enum GraphQLDataSourceRequestKind {
  INCOMING_OPERATION = 'incoming operation',
  HEALTH_CHECK = 'health check',
  LOADING_SCHEMA = 'loading schema',
}

export type GraphQLDataSourceProcessOptions<
  TContext extends Record<string, any> = Record<string, any>,
> = {
  /**
   * The request to send to the subgraph.
   */
  request: GatewayGraphQLRequestContext<TContext>['request'];
} & (
  | {
      kind: GraphQLDataSourceRequestKind.INCOMING_OPERATION;
      /**
       * The GraphQLRequestContext for the operation received by the gateway, or
       * one of the strings if this operation is generated by the gateway without an
       * incoming request.
       */
      incomingRequestContext: GatewayGraphQLRequestContext<TContext>;
      /**
       * Equivalent to incomingRequestContext.context (provided here for
       * backwards compatibility): the object created by the Apollo Server
       * `context` function.
       *
       * @deprecated Use `incomingRequestContext.context` instead (after
       * checking `kind`).
       */
      context: GatewayGraphQLRequestContext<TContext>['context'];
      /**
       * The document representation of the request's query being sent to the subgraph, if available.
       *
       * Note that this field is not populated by default. You can enable it by setting the
       * `GatewayConfig.queryPlannerConfig.exposeDocumentNodeInFetchNode` configuration but note that
       * this will increase the memory used by the gateway query plan cache.
       */
      document?: GatewayGraphQLRequestContext<TContext>['document'];

      /**
      * The path in the overall gateway operation at which that subgraph request gets inserted.
      * Please note that this could be set to `undefined` when the path is not available, or set to an empty array for top-level fetch operations.
      */
      pathInIncomingRequest?: ResponsePath;
    }
  | {
      kind:
        | GraphQLDataSourceRequestKind.HEALTH_CHECK
        | GraphQLDataSourceRequestKind.LOADING_SCHEMA;
      /**
       * Mostly provided for historical reasons.
       */
      context: Record<string, any>;
    }
);
