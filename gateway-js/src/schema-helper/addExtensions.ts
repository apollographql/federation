import { GraphQLSchema } from 'graphql';
import { ApolloGraphQLSchemaExtensions } from "../typings/graphql";

const { version } = require('../../package.json');

export function addExtensions(schema: GraphQLSchema): GraphQLSchema {
  const schemaExtension = schema.extensions as ApolloGraphQLSchemaExtensions ?? {};
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
