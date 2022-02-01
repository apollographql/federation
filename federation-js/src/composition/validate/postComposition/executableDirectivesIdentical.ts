import { GraphQLError, isSpecifiedDirective, print } from 'graphql';
import {
  errorWithCode,
  logDirective,
  typeNodesAreEquivalent,
  getFederationMetadata,
} from '../../utils';
// Importing from 'dist' is not actually supported as part of the public API,
// but this allows us not to duplicate things in the meantime while the
// @apollo/federation package still exists.
import { isKnownSubgraphDirective } from '@apollo/subgraph/dist/directives';
import { PostCompositionValidator } from '.';

/**
 * A custom directive must be defined identically across all services. This means
 * they must have the same name and same locations. Locations are the "on" part of
 * a directive, for example:
 *    directive @stream on FIELD | QUERY
 */
export const executableDirectivesIdentical: PostCompositionValidator = ({
  schema,
}) => {
  const errors: GraphQLError[] = [];

  const customDirectives = schema
    .getDirectives()
    .filter(x => !isKnownSubgraphDirective(x) && !isSpecifiedDirective(x));

  customDirectives.forEach(directive => {
    const directiveFederationMetadata = getFederationMetadata(directive);

    if (!directiveFederationMetadata) return;

    const definitions = Object.entries(
      directiveFederationMetadata.directiveDefinitions,
    );

    // Side-by-side compare all definitions of a single directive, if there's a
    // discrepancy in any of those diffs, we should provide an error.
    const shouldError = definitions.some(([, definition], index) => {
      // Skip the non-comparison step
      if (index === 0) return;
      const [, previousDefinition] = definitions[index - 1];
      return !typeNodesAreEquivalent(definition, previousDefinition);
    });

    if (shouldError) {
      const directiveDefinitionNodes = definitions.map(([_, directiveDefinitionNode]) => directiveDefinitionNode);
      errors.push(
        errorWithCode(
          'EXECUTABLE_DIRECTIVES_IDENTICAL',
          logDirective(directive.name) +
            `custom directives must be defined identically across all services. See below for a list of current implementations:\n${definitions
              .map(([serviceName, definition]) => {
                return `\t${serviceName}: ${print(definition)}`;
              })
              .join('\n')}`,
          directiveDefinitionNodes,
        ),
      );
    }
  });
  return errors;
};
