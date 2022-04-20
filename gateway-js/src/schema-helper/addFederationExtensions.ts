import { GraphQLSchema } from 'graphql';
import { version as gatewayVersion } from '../version';

export function addFederationExtensions(schema: GraphQLSchema): GraphQLSchema {
  schema.extensions = {
    ...schema.extensions,
    apolloFederation: {
      ...(schema.extensions?.apolloFederation as object | undefined),
      gatewayVersion,
    },
  };

  return schema;
}
