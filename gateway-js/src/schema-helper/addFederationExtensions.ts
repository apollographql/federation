import { GraphQLSchema } from 'graphql';
const { version } = require('../package.json');

export function addFederationExtensions(schema: GraphQLSchema): GraphQLSchema {
  schema.extensions = {
    ...schema.extensions,
    apollo: {
      ...schema.extensions.apollo,
      gateway: {
        ...schema.extensions.apollo?.gateway,
        version,
      }
    },
  };

  return schema;
}
