import { buildSubgraphSchema } from '@apollo/subgraph';
import { DocumentNode } from 'graphql';
import { deprecate } from 'util';

export { GraphQLSchemaModule } from 'apollo-graphql';

/**
 * @deprecated Use `buildSubgraphSchema` instead.
 */
 export const buildFederatedSchema = deprecate(
  buildSubgraphSchema,
  `'buildFederatedSchema' is deprecated. Use 'buildSubgraphSchema' instead.`,
);
export { buildSubgraphSchema };

export interface ServiceDefinition {
  typeDefs: DocumentNode;
  name: string;
  url?: string;
}
