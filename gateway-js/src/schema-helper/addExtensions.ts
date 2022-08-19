import { GraphQLSchema } from 'graphql';
import { GraphQLSchemaExtensions } from 'graphql/type/schema';

const { version } = require('../../package.json');

export function addExtensions(schema: GraphQLSchema): GraphQLSchema {
  const schemaExtension = schema.extensions as GraphQLSchemaExtensions ?? {};
  const apolloExtension = schemaExtension?.apollo ?? {};
  const gatewayExtension = apolloExtension?.gateway ?? {};

  schema.extensions = {
    ...schema.extensions,
    apollo: {
      ...apolloExtension,
      gateway: {
        ...gatewayExtension,
        version,
      }
    },
  };

  return schema;
}
