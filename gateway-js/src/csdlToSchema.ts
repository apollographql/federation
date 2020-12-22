import { extendSchema, GraphQLSchema, parse } from 'graphql';

export function csdlToSchema(csdl: string) {
  let schema = new GraphQLSchema({
    query: undefined,
  });

  const parsed = parse(csdl);
  return extendSchema(schema, parsed, { assumeValidSDL: true });
}
