import { GraphQLObjectType, GraphQLResolveInfo } from 'graphql';

type GraphQLReferenceResolver<TContext> = (
  reference: object,
  context: TContext,
  info: GraphQLResolveInfo,
) => any;

declare module 'graphql/type/definition' {
  interface GraphQLObjectType {
    resolveReference?: GraphQLReferenceResolver<any>;
  }

  interface GraphQLObjectTypeConfig<TSource, TContext> {
    resolveReference?: GraphQLReferenceResolver<TContext>;
  }
}

type GraphQLObjectTypeWithReferenceResolver = GraphQLObjectType &
  Required<Pick<GraphQLObjectType, 'resolveReference'>>;

// This seems to only be needed for TS during tests. I suppose the `declare module`
// above isn't properly loaded during a test run, but it's unclear to me why.
export function hasReferenceResolver(
  type: GraphQLObjectType,
): type is GraphQLObjectTypeWithReferenceResolver {
  return (
    'resolveReference' in type && typeof type.resolveReference === 'function'
  );
}
