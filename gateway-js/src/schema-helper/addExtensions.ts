import { GraphQLSchema } from 'graphql';
import { GraphQLSchemaExtensions } from 'graphql/type/schema';

const { version } = require('../../package.json');

export function addExtensions(schema: GraphQLSchema): GraphQLSchema {
  const extensions = schema.extensions as GraphQLSchemaExtensions;

  schema.extensions = {
    ...extensions,
    apollo: {
      ...extensions.apollo,
      gateway: {
        ...extensions.apollo?.gateway,
        version,
      }
    },
  };

  return schema;
}
