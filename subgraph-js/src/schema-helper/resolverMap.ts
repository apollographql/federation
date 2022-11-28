import { GraphQLFieldResolver, GraphQLScalarType, DocumentNode } from 'graphql';
import { IResolvers } from "@graphql-tools/utils";

export interface GraphQLSchemaModule {
  typeDefs: DocumentNode;
  resolvers?: IResolvers;
}

// eslint-disable-next-line @typescript-eslint/ban-types
// Deprecating this type, use IResolvers instead for interactions with buildSubgraphSchema
export interface GraphQLResolverMap<TContext = {}> {
  [typeName: string]:
    | {
        [fieldName: string]:
          | GraphQLFieldResolver<any, TContext>
          | {
              requires?: string;
              resolve: GraphQLFieldResolver<any, TContext>;
            };
      }
    | GraphQLScalarType
    | {
        [enumValue: string]: string | number;
      };
}
