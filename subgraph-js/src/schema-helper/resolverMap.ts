import { GraphQLFieldResolver, GraphQLScalarType, DocumentNode } from 'graphql';
import type { GraphQLReferenceResolver } from '../schemaExtensions';

export interface GraphQLSchemaModule {
  typeDefs: DocumentNode;
  resolvers?: GraphQLResolverMap<any>;
}

// eslint-disable-next-line @typescript-eslint/ban-types
export interface GraphQLResolverMap<TContext = {}, TReference extends object = any> {
  [typeName: string]:
    | ({
        [fieldName: string]:
          | GraphQLFieldResolver<any, TContext>
          | {
              requires?: string;
              resolve?: GraphQLFieldResolver<any, TContext>;
              subscribe?: GraphQLFieldResolver<any, TContext>;
            };
      } & {
        __resolveReference?: GraphQLReferenceResolver<TContext, TReference>;
      })
    | GraphQLScalarType
    | {
        [enumValue: string]: string | number;
      };
}
