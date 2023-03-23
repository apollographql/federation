import { GraphQLSchemaExtensions } from 'graphql';

interface ApolloGatewayExtensions {
  version?: string;
}

export interface ApolloGraphQLSchemaExtensions extends GraphQLSchemaExtensions {
  apollo?: {
    gateway?: ApolloGatewayExtensions;
  }
}
