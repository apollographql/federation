import {
  buildSchema,
  ExecutionResult,
  GraphQLError,
  GraphQLSchema,
  graphqlSync,
} from 'graphql';

export function batchIntrospect(
  sdl: string,
  queries: string[],
): ExecutionResult[] {
  let schema: GraphQLSchema;
  try {
    schema = buildSchema(sdl);
  } catch (e) {
    return Array(queries.length).fill({
      errors: [e],
    });
  }
  if (!schema) {
    return Array(queries.length).fill({
      errors: [new Error(`couldn't build schema from SDL`)],
    });
  }
  return queries.map((query) => introspectOne(schema, query));
}

export function introspect(sdl: string, query: string): ExecutionResult {
  let schema: GraphQLSchema;
  try {
    schema = buildSchema(sdl);
  } catch (e) {
    return {
      errors: [e],
    };
  }
  if (!schema) {
    return {
      errors: [new GraphQLError("couldn't build schema from SDL")],
    };
  }
  return introspectOne(schema, query);
}

const introspectOne = (
  schema: GraphQLSchema,
  query: string,
): ExecutionResult => {
  const { data, errors } = graphqlSync(schema, query);

  if (errors) {
    return { data, errors: [...errors] };
  } else {
    return { data, errors: [] };
  }
};
