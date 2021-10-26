import { GraphQLResponse } from 'apollo-server-types';
import {
  GraphQLSchema,
  graphql,
  graphqlSync,
  DocumentNode,
  parse,
} from 'graphql';
import { enablePluginsForSchemaResolvers } from 'apollo-server-core/dist/utils/schemaInstrumentation';
import { GraphQLDataSource, GraphQLDataSourceProcessOptions } from './types';

export class LocalGraphQLDataSource<
  TContext extends Record<string, any> = Record<string, any>,
> implements GraphQLDataSource<TContext>
{
  constructor(public readonly schema: GraphQLSchema) {
    enablePluginsForSchemaResolvers(schema);
  }

  async process({
    request,
    context,
  }: GraphQLDataSourceProcessOptions<TContext>): Promise<GraphQLResponse> {
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

    const sdl = result.data && result.data._service && result.data._service.sdl;
    return parse(sdl);
  }
}
