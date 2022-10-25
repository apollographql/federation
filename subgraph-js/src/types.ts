import {
  GraphQLFieldConfig,
  GraphQLString,
  GraphQLUnionType,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLNonNull,
  GraphQLList,
  GraphQLType,
  GraphQLNamedType,
  isNamedType,
  isObjectType,
  GraphQLResolveInfo,
} from 'graphql';
import { PromiseOrValue } from 'graphql/jsutils/PromiseOrValue';
import { maybeCacheControlFromInfo } from '@apollo/cache-control-types';
import { ApolloGraphQLObjectTypeExtensions } from './schemaExtensions';

export type Maybe<T> = null | undefined | T;

export const EntityType = new GraphQLUnionType({
  name: '_Entity',
  types: [],
});

export const ServiceType = new GraphQLObjectType({
  name: '_Service',
  fields: {
    sdl: {
      type: GraphQLString,
      description:
        'The sdl representing the federated service capabilities. Includes federation directives, removes federation types, and includes rest of full schema after schema directives have been applied',
    },
  },
});

export const AnyType = new GraphQLScalarType({
  name: '_Any',
  serialize(value) {
    return value;
  },
});

export const LinkImportType = new GraphQLScalarType({
  name: 'link__Import',
  specifiedByURL: null
});

function isPromise<T>(value: PromiseOrValue<T>): value is Promise<T> {
  return typeof (value as {then?: unknown})?.then === 'function';
}

function addTypeNameToPossibleReturn<T>(
  maybeObject: null | T,
  typename: string,
): null | (T & { __typename: string }) {
  if (maybeObject !== null && typeof maybeObject === 'object') {
    Object.defineProperty(maybeObject, '__typename', {
      value: typename,
    });
  }
  return maybeObject as null | (T & { __typename: string });
}

export function entitiesResolver({
  representations,
  context,
  info
}: {
  representations: any,
  context: any,
  info: GraphQLResolveInfo
}) {
  return representations.map((reference: { __typename: string } & object) => {
    const { __typename } = reference;

    const type = info.schema.getType(__typename);
    if (!type || !isObjectType(type)) {
      throw new Error(
        `The _entities resolver tried to load an entity for type "${__typename}", but no object type of that name was found in the schema`,
      );
    }

    // If you're using `@apollo/subgraph` with Apollo Server v3+ (without
    // disabling the cache control plugin) and the schema has a `@cacheControl`
    // directive on the specific type selected by `__typename`, restrict the
    // request's cache policy based on that directive. (This does not work with
    // Apollo Server 2 or non-Apollo-Server GraphQL servers;
    // maybeCacheControlFromInfo will return null in that case.)
    const cacheControl = maybeCacheControlFromInfo(info);
    if (cacheControl) {
      const cacheHint = cacheControl.cacheHintFromType(type);

      if (cacheHint) {
        cacheControl.cacheHint.restrict(cacheHint);
      }
    }

    const extensions: ApolloGraphQLObjectTypeExtensions = type.extensions;
    const resolveReference = extensions.apollo?.subgraph?.resolveReference ?? (() => reference);

    // FIXME somehow get this to show up special in Studio traces?
    const result = resolveReference(reference, context, info);

    if (isPromise(result)) {
      return result.then((x: any) =>
        addTypeNameToPossibleReturn(x, __typename),
      );
    }

    return addTypeNameToPossibleReturn(result, __typename);
  });
}


export const entitiesField: GraphQLFieldConfig<any, any> = {
  type: new GraphQLNonNull(new GraphQLList(EntityType)),
  args: {
    representations: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(AnyType))),
    },
  },
  resolve(_source, { representations }, context, info) {
    return entitiesResolver({ representations, context, info });
  },
};

export const serviceField: GraphQLFieldConfig<any, any> = {
  type: new GraphQLNonNull(ServiceType),
};

export const federationTypes: GraphQLNamedType[] = [
  ServiceType,
  AnyType,
  EntityType,
  LinkImportType,
];

export function isFederationType(type: GraphQLType): boolean {
  return (
    isNamedType(type) && federationTypes.some(({ name }) => name === type.name)
  );
}
