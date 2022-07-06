import {GraphQLResponse, GraphQLRequestContext, GraphQLRequest} from 'apollo-server-types';
import {
    GraphQLRequest as GraphQLRequest3,
    GraphQLResponse as GraphQLResponse3,
    GraphQLRequestContext as GraphQLRequestContext3
} from 'apollo-server-types-3';

export interface GraphQLDataSource<
  TContext extends Record<string, any> = Record<string, any>,
> {
  process(
    options: GraphQLDataSourceProcessOptions<TContext>,
  ): Promise<GraphQLResponse | GraphQLResponse3>;
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
   *
   * For backwards compatibility with Apollo Server 2, the type of Request can come from
   * both versions of the apollo-server-types.
   */
  request: GraphQLRequest | GraphQLRequest3
} & (
  {
      kind: GraphQLDataSourceRequestKind.INCOMING_OPERATION;
      /**
       * The GraphQLRequestContext for the operation received by the gateway, or
       * one of the strings if this operation is generated by the gateway without an
       * incoming request.
       *
       * For backwards compatibility with Apollo Server 2, `overallCachePolicy` needs
       * to be treated as optional.
       */
      incomingRequestContext: GraphQLRequestContext<TContext> | GraphQLRequestContext3<TContext>
      /**
       * Equivalent to incomingRequestContext.context (provided here for
       * backwards compatibility): the object created by the Apollo Server
       * `context` function.
       *
       * @deprecated Use `incomingRequestContext.context` instead (after
       * checking `kind`).
       */
      context: GraphQLRequestContext<TContext>['context'] | GraphQLRequestContext3<TContext>['context'];
    }
  | {
      kind:
        | GraphQLDataSourceRequestKind.HEALTH_CHECK
        | GraphQLDataSourceRequestKind.LOADING_SCHEMA;
      /**
       * Mostly provided for historical reasons.
       */
      context: {};

    /**
     * Mostly provided for backwards compatibility with AS2.
     */
      incomingRequestContext?: undefined;
    }
);
