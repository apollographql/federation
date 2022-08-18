import { GraphQLSchema } from 'graphql';

const { version } = require('../../package.json');

export function addExtensions(schema: GraphQLSchema): GraphQLSchema {
  const apolloExtension = schema.extensions.apollo as any ?? {};
  schema.extensions = {
    ...schema.extensions,
    apollo: {
      ...apolloExtension,
      gateway: {
        ...apolloExtension?.gateway,
        version,
      }
    },
  };

  return schema;
}
