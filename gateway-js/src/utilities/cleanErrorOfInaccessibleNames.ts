import { GraphQLError, GraphQLSchema } from 'graphql';

export function cleanErrorOfInaccessibleNames(
  schema: GraphQLSchema,
  error: GraphQLError,
): GraphQLError {

  const typeDotFieldRegex = /"([_A-Za-z][_0-9A-Za-z]*)\.([_A-Za-z][_0-9A-Za-z]*)"/g;
  error.message = error.message.replace(typeDotFieldRegex, (match: string) => {
    const [typeName, fieldName] = match.replace(/"/g, '',).split('.');
    const type = schema.getType(typeName);
    if (!type) {
      return '[inaccessible field]';
    } else {
      const field = 'getFields' in type ? type.getFields()[fieldName] : null;
      return field ? match : '[inaccessible field]';
    }
  });

  const typeRegex = /"([_A-Za-z][_0-9A-Za-z]*)"/g;
  error.message = error.message.replace(typeRegex, (match: string) => {
    // Special cases in graphql-js that happen to match our regex.
    if (match === '"isTypeOf"' || match === '"resolveType"') return match;
    const typeName = match.replace(/"/g, '',);
    return schema.getType(typeName) ? match : '[inaccessible type]';
  })

  return error;
}
