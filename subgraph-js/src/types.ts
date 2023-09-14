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
  isInterfaceType,
  defaultTypeResolver,
  GraphQLError,
  GraphQLAbstractType,
  GraphQLSchema,
  GraphQLInterfaceType,
} from 'graphql';
import { PromiseOrValue } from 'graphql/jsutils/PromiseOrValue';
import { maybeCacheControlFromInfo } from '@apollo/cache-control-types';
import { ApolloGraphQLInterfaceTypeExtensions, ApolloGraphQLObjectTypeExtensions, GraphQLReferenceResolver } from './schemaExtensions';
import { inspect } from 'util';

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

async function maybeAddTypeNameToPossibleReturn<T extends { __typename?: string }>(
  maybeObject: PromiseOrValue<null | T>,
  typename: string,
): Promise<null | T> {
  const objectOrNull = await maybeObject;
  if (
    objectOrNull !== null
    && typeof objectOrNull === 'object'
  ) {
    // If the object already has a __typename assigned, we're "refining" the
    // type from an interface to an interfaceObject.
    if ('__typename' in objectOrNull && objectOrNull.__typename !== typename) {
      // XXX There's a really interesting nuance here in this condition. At a
      // first glance, it looks like the code here and below could be simplified
      // to just:
      // ```
      // objectOrNull.__typename = typename;
      // return objectOrNull;
      // ```
      // But in this case, something internal to `graphql-js` depends on the
      // identity of the object returned here. If we mutate in this case, we end
      // up with errors from `graphql-js`. This might be worth investigating at
      // some point, but for now creating a new object solves the problem and
      // doesn't create any new ones.
      return {
        ...objectOrNull,
        __typename: typename,
      };
    }

    Object.defineProperty(objectOrNull, '__typename', {
      value: typename,
    });
  }
  return objectOrNull;
}

/**
 * Copied and adapted from GraphQL-js to provide more tailored error messages (but the equivalent method is also not exported
 * by `graphql-js`).
 *
 * For @key on interfaces, we need to check that we can resolve the runtime type of the object returned by the interface
 * `__resolveReference`. If we cannot, and we simply don't add any `__typename` to the result, the graphQL-js will end
 * erroring out, but the error will not be user friendly as it will say something along the lines of:
 * ```
 *   Abstract type "_Entity" must resolve to an Object type at runtime for field "Query._entities". Either the "_Entity" type
 *   should provide a "resolveType" function or each possible type should provide an "isTypeOf" function.
 * ```
 * But this is ultimately incorrect, as it is only interface type the user must use "resolveType", add a __typename, or rely
 * on "isTypeOf". And so we have to somewhat copy and adapt the logic slightly (mostly to provide a more user friendly method).
 */
function ensureValidRuntimeType(
  runtimeTypeName: unknown,
  schema: GraphQLSchema,
  returnType: GraphQLAbstractType,
  result: unknown,
): GraphQLObjectType {
  if (runtimeTypeName == null) {
    throw new GraphQLError(
      `Abstract type "${returnType.name}" \`__resolveReference\` method must resolve to an Object type at runtime. Either the object returned by "${returnType}.__resolveReference" must include a valid \`__typename\` field, or the "${returnType.name}" type should provide a "resolveType" function or each possible type should provide an "isTypeOf" function.`,
    );
  }

  if (typeof runtimeTypeName !== 'string') {
    throw new GraphQLError(
      `Abstract type "${returnType.name}" \`__resolveReference\` method must resolve to an Object type at runtime with ` +
        `value ${inspect(result)}, received "${inspect(runtimeTypeName)}".`,
    );
  }

  const runtimeType = schema.getType(runtimeTypeName);
  if (runtimeType == null) {
    throw new GraphQLError(
      `Abstract type "${returnType.name}" \`__resolveReference\` method resolved to a type "${runtimeTypeName}" that does not exist inside the schema.`,
    );
  }

  if (!isObjectType(runtimeType)) {
    throw new GraphQLError(
      `Abstract type "${returnType.name}" \`__resolveReference\` method resolved to a non-object type "${runtimeTypeName}".`,
    );
  }

  if (!schema.isSubType(returnType, runtimeType)) {
    throw new GraphQLError(
      `Runtime Object type "${runtimeType.name}" \`__resolveReference\` method is not a possible type for "${returnType.name}".`,
    );
  }

  return runtimeType;
}

async function withResolvedType<T>({
  type,
  value,
  context,
  info,
  callback,
}: {
  type: GraphQLInterfaceType,
  value: any,
  context: any,
  info: GraphQLResolveInfo,
  callback: (runtimeType: GraphQLObjectType) => PromiseOrValue<T>,
}): Promise<T> {
  const resolveTypeFn = type.resolveType ?? defaultTypeResolver;
  const runtimeType = resolveTypeFn(await value, context, info, type);
  if (isPromise(runtimeType)) {
    return runtimeType.then((name) => (
      callback(ensureValidRuntimeType(name, info.schema, type, value))
    ));
  }

  return callback(ensureValidRuntimeType(runtimeType, info.schema, type, value));
}

function definedResolveReference(type: GraphQLObjectType | GraphQLInterfaceType): GraphQLReferenceResolver<any> | undefined {
  const extensions: ApolloGraphQLObjectTypeExtensions | ApolloGraphQLInterfaceTypeExtensions = type.extensions;
  return extensions.apollo?.subgraph?.resolveReference;
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
    if (!type || !(isObjectType(type) || isInterfaceType(type))) {
      throw new Error(
        `The _entities resolver tried to load an entity for type "${__typename}", but no object or interface type of that name was found in the schema`,
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

    const resolveReference = definedResolveReference(type);

    // FIXME somehow get this to show up special in Studio traces?
    const result = resolveReference ? resolveReference(reference, context, info) : reference;

    if (isInterfaceType(type)) {
      return withResolvedType({
        type,
        value: result,
        context,
        info,
        callback: (runtimeType) => {
          // If we had no interface-level __resolveReference, then we look for one on the runtime
          // type itself, and call it if it exists. If that one also doesn't, we essentially end
          // up using the same resolver than for object types, one that does nothing.
          let finalResult = maybeAddTypeNameToPossibleReturn(result, runtimeType.name);
          if (!resolveReference) {
            const runtimeResolveReference = definedResolveReference(runtimeType);
            if (runtimeResolveReference) {
              // Note that we call the resolver on the reference with the "proper" __typename,
              // and then add back the __typename again in case the resolver removed it (which
              // ultimately is the behaviour we use with object type __resolveReference in
              // general).
              finalResult = isPromise(finalResult)
                ? finalResult.then((r) => runtimeResolveReference(r, context, info))
                : runtimeResolveReference(finalResult, context, info);
              finalResult = maybeAddTypeNameToPossibleReturn(finalResult, runtimeType.name);
            }
          }
          return finalResult;
        },
      });
    }

    return maybeAddTypeNameToPossibleReturn(result, __typename);
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
