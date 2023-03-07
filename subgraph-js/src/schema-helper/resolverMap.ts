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
          | GraphQLFieldResolver<any, TContext>
          | {
              requires?: string;
              resolve?: GraphQLFieldResolver<any, TContext>;
              subscribe?: GraphQLFieldResolver<any, TContext>;
            };
      }
    | GraphQLScalarType
    | {
        [enumValue: string]: string | number;
      };
}
