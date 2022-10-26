import {
  GraphQLInterfaceTypeExtensions,
  GraphQLObjectTypeExtensions,
  GraphQLResolveInfo,
  GraphQLUnionTypeExtensions
} from 'graphql';

export type GraphQLReferenceResolver<TContext> = (
  reference: object,
  context: TContext,
  info: GraphQLResolveInfo,
) => any;

interface ApolloSubgraphExtensions<TContext> {
  resolveReference?: GraphQLReferenceResolver<TContext>;
}

export interface ApolloGraphQLObjectTypeExtensions<_TSource = any, _TContext = any> extends GraphQLObjectTypeExtensions {
  apollo?: {
    subgraph?: ApolloSubgraphExtensions<_TContext>;
  }
}

export interface ApolloGraphQLInterfaceTypeExtensions<_TSource = any, _TContext = any> extends GraphQLInterfaceTypeExtensions {
  apollo?: {
    subgraph?: ApolloSubgraphExtensions<_TContext>;
  }
}

export interface ApolloGraphQLUnionTypeExtensions<_TSource = any, _TContext = any> extends GraphQLUnionTypeExtensions {
  apollo?: {
    subgraph?: ApolloSubgraphExtensions<_TContext>;
  }
}
