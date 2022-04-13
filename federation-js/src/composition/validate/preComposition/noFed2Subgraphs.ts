import { visit, GraphQLError, Kind } from 'graphql';
import { ServiceDefinition } from '../../types';

import { errorWithCode, findDirectivesOnNode } from '../../utils';

/**
 * - There are no subgraphs that @link to a version that is unsupported by 1.0 composition.
 */
export const noFed2Subgraphs = ({
  name: serviceName,
  typeDefs,
}: ServiceDefinition) => {
  const errors: GraphQLError[] = [];
  visit(typeDefs, {
    SchemaExtension(schemaExtensionNode) {
      const directives = findDirectivesOnNode(schemaExtensionNode, 'link').filter(directive => {
        if (directive.name.value === 'link') {
          const argNode = directive.arguments?.find(
            arg => arg.name.value === 'url',
          );
          if (argNode) {
            if (argNode.value.kind === Kind.STRING) {
              const url = argNode.value.value;
              const [,spec, versionRaw] = url.match(
                /(federation|link)\/v(\d+\.\d+)/,
              )!;

              const version = parseFloat(versionRaw);
              return (
                (spec === 'federation' && version >= 2.0) ||
                (spec === 'link' && version >= 1.0)
              );
            }
          }
        }
        return false;
      });
      if (directives.length > 0) {
        errors.push(
          errorWithCode(
            'NO_FED2_SUBGRAPHS',
            `[${serviceName}] Schema contains a Federation 2 subgraph. Only federation 1 subgraphs can be composed with the fed1 composer.`,
          )
        );
      }
    },
  });

  return errors;
};
