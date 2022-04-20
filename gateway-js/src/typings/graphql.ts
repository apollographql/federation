import { GraphQLResolveInfo } from 'graphql';

type GraphQLReferenceResolver<TContext> = (
  reference: object,
  context: TContext,
  info: GraphQLResolveInfo,
) => any;

interface ApolloSubgraphExtensions<TContext> {
  resolveReference?: GraphQLReferenceResolver<TContext>;
}

declare module 'graphql/type/definition' {
  interface GraphQLObjectTypeExtensions<_TSource = any, _TContext = any> {
    apolloSubgraph?: ApolloSubgraphExtensions<_TContext>;
  }

  interface GraphQLInterfaceTypeExtensions<_TSource = any, _TContext = any> {
    apolloSubgraph?: ApolloSubgraphExtensions<_TContext>;
  }

  interface GraphQLUnionTypeExtensions<_TSource = any, _TContext = any> {
    apolloSubgraph?: ApolloSubgraphExtensions<_TContext>;
  }
}
