import { GraphQLResolveInfo } from 'graphql';

type GraphQLReferenceResolver<TContext> = (
  reference: object,
  context: TContext,
  info: GraphQLResolveInfo,
) => any;

interface ApolloSubgraphExtensions<TContext> {
  resolveReference?: GraphQLReferenceResolver<TContext>;
}

interface ApolloGatewayExtensions {
  version?: String;
}

declare module 'graphql/type/definition' {
  interface GraphQLObjectTypeExtensions<_TSource = any, _TContext = any> {
    apollo?: {
      subgraph?: ApolloSubgraphExtensions<_TContext>;
    }
  }

  interface GraphQLInterfaceTypeExtensions<_TSource = any, _TContext = any> {
    apollo?: {
      subgraph?: ApolloSubgraphExtensions<_TContext>;
    }
  }

  interface GraphQLUnionTypeExtensions<_TSource = any, _TContext = any> {
    apollo?: {
      subgraph?: ApolloSubgraphExtensions<_TContext>;
    }
  }
}

declare module 'graphql/type/schema' {
  interface GraphQLSchemaExtensions {
    apollo?: {
      gateway?: ApolloGatewayExtensions;
    }
  }
}
