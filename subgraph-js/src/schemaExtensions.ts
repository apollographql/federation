import { GraphQLResolveInfo } from 'graphql';

type GraphQLReferenceResolver<TContext> = (
  reference: object,
  context: TContext,
  info: GraphQLResolveInfo,
) => any;

declare module 'graphql/type/definition' {
  interface GraphQLObjectTypeExtensions<_TSource = any, _TContext = any> {
    resolveReference?: GraphQLReferenceResolver<_TContext>
  }
}
