import { GraphQLSchemaExtensions } from 'graphql';

interface ApolloGatewayExtensions {
  version?: String;
}

export interface ApolloGraphQLSchemaExtensions extends GraphQLSchemaExtensions {
  apollo?: {
    gateway?: ApolloGatewayExtensions;
  }
}
