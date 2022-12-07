import { GatewayGraphQLResponse } from '@apollo/server-gateway-interface';
import {
  GraphQLSchema,
  graphql,
  graphqlSync,
  DocumentNode,
  parse,
} from 'graphql';
import { GraphQLDataSource, GraphQLDataSourceProcessOptions } from './types';

export class LocalGraphQLDataSource<
  TContext extends Record<string, any> = Record<string, any>,
> implements GraphQLDataSource<TContext>
{
  constructor(public readonly schema: GraphQLSchema) {
  }

  async process({
    request,
    context,
  }: GraphQLDataSourceProcessOptions<TContext>): Promise<GatewayGraphQLResponse> {
    return graphql({
      schema: this.schema,
      source: request.query!,
      variableValues: request.variables,
      operationName: request.operationName,
      contextValue: context,
    });
  }

  public sdl(): DocumentNode {
    const result = graphqlSync({
      schema: this.schema,
      source: `{ _service { sdl }}`,
    });
    if (result.errors) {
      throw new Error(result.errors.map((error) => error.message).join('\n\n'));
    }

    const sdl = result.data && result.data._service && (result.data._service as any).sdl;
    return parse(sdl);
  }
}
