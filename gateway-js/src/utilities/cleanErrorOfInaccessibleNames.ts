import { GraphQLError, GraphQLSchema } from 'graphql';

export function cleanErrorOfInaccessibleNames(
  schema: GraphQLSchema,
  error: GraphQLError,
): GraphQLError {
  const typeRegex = /"([_A-Za-z][_0-9A-Za-z]*)"/g;
  const typeDotFieldRegex =
    /"([_A-Za-z][_0-9A-Za-z]*)\.([_A-Za-z][_0-9A-Za-z]*)"/g;

  const schemaTypes = Object.keys(schema.getTypeMap());
  let match: RegExpExecArray | null;
  const typeDotFieldMatches: [string, string][] = [];
  while ((match = typeDotFieldRegex.exec(error.message)) !== null) {
    typeDotFieldMatches.push([match[1], match[2]]);
  }

  if (typeDotFieldMatches && typeDotFieldMatches.length > 0) {
    const inaccessibleFields = typeDotFieldMatches.filter(
      ([typeName, fieldName]) => {
        const type = schema.getType(typeName);
        if (!type) {
          return true;
        } else {
          const field =
            'getFields' in type ? type.getFields()[fieldName] : null;
          return !field;
        }
      },
    );
    if (inaccessibleFields.length > 0) {
      error.message = error.message.replace(
        new RegExp(
          inaccessibleFields
            .map(([type, field]) => `("${type}.${field}")`)
            .join('|'),
          'g',
        ),
        '[inaccessible field]',
      );
    }
  }

  const typeMatches: string[] = [];
  while ((match = typeRegex.exec(error.message)) !== null) {
    if (match[1] !== 'resolveType' && match[1] !== 'isTypeOf') {
      typeMatches.push(match[1]);
    }
  }
  if (typeMatches && typeMatches.length > 0) {
    const inaccessibleTypes = typeMatches.filter(
      (match) => !schemaTypes.includes(match),
    );

    if (inaccessibleTypes.length > 0) {
      error.message = error.message.replace(
        new RegExp(
          inaccessibleTypes
            .map((namedType) => '("' + namedType + '")')
            .join('|'),
          'g',
        ),
        '[inaccessible type]',
      );
    }
  }

  return error;
}
