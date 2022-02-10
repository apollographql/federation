import { GraphQLFieldResolver, GraphQLScalarType, DocumentNode } from 'graphql';

export interface GraphQLSchemaModule {
  typeDefs: DocumentNode;
  resolvers?: GraphQLResolverMap<any>;
}

// eslint-disable-next-line @typescript-eslint/ban-types
export interface GraphQLResolverMap<TContext = {}> {
  [typeName: string]:
    | {
        [fieldName: string]:
          | GraphQLFieldResolver<any, TContext, any>
          | {
              requires?: string;
              resolve: GraphQLFieldResolver<any, TContext, any>;
            };
      }
    | GraphQLScalarType
    | {
        [enumValue: string]: string | number;
      };
}
