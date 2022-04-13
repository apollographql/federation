import { visit, GraphQLError, Kind } from 'graphql';
import { ServiceDefinition } from '../../types';

import { errorWithCode } from '../../utils';

/**
 * - There are no fields with @external on base type definitions
 */
export const noFed2Subgraphs = ({
  name: serviceName,
  typeDefs,
}: ServiceDefinition) => {
  const errors: GraphQLError[] = [];
  visit(typeDefs, {
    SchemaExtension(schemaExtensionNode) {
      const directives = schemaExtensionNode.directives?.filter(directive => {
        if (directive.name.value === 'link') {
          const argNode = directive.arguments?.find(
            arg => arg.name.value === 'url',
          );
          if (argNode) {
            if (argNode.value.kind === Kind.STRING) {
              const url = argNode.value.value;
              // lexical comparison of versions is intentional
              if (url.startsWith('https://specs.apollo.dev/federation/v') && url >= 'https://specs.apollo.dev/federation/v2.0') {
                return true;
              }
              if (url.startsWith('https://specs.apollo.dev/link/v') && url >= 'https://specs.apollo.dev/link/v1.0') {
                return true;
              }
            }
          }
        }
        return false;
      }) ?? [];
      if (directives.length > 0) {
        errors.push(
          errorWithCode(
            'NO_FED2_SUBGRAPHS',
            `[${serviceName}] Schema contains a Federation 2 subgraph. Only federation 1 subgraphs can be composed with the fed1 composer`,
          )
        );
      }
    },
  });

  return errors;
};
