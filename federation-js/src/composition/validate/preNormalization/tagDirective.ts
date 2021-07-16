import {
  BREAK,
  DirectiveDefinitionNode,
  GraphQLError,
  print,
  visit,
} from 'graphql';
import { ServiceDefinition } from '../../types';
import { errorWithCode, logDirective } from '../../utils';

/**
 * If there are tag usages in the service definition, check that the tag directive
 * definition is included and correct.
 */
export const tagDirective = ({
  name: serviceName,
  typeDefs,
}: ServiceDefinition) => {
  let tagUsed = false;
  visit(typeDefs, {
    Directive(node) {
      if (node.name.value === 'tag') {
        tagUsed = true;
        return BREAK;
      }
    },
  });

  const errors: GraphQLError[] = [];
  let tagDirectiveDefinition: DirectiveDefinitionNode | undefined;
  if (!tagUsed) {
    return [];
  } else {
    visit(typeDefs, {
      DirectiveDefinition(node) {
        if (node.name.value === 'tag') {
          tagDirectiveDefinition = node;
          return BREAK;
        }
      },
    });
  }

  const printedTagDefinition =
    'directive @tag(name: String!) repeatable on FIELD_DEFINITION';
  if (!tagDirectiveDefinition) {
    errors.push(
      errorWithCode(
        'TAG_DIRECTIVE_DEFINITION_MISSING',
        logDirective('tag') +
          `Found @tag usages in service ${serviceName}, but the @tag directive definition wasn't included. Please include the following directive definition in your schema's type definitions:\n\t${printedTagDefinition}`,
      ),
    );
  } else {
    if (print(tagDirectiveDefinition) !== printedTagDefinition) {
      errors.push(
        errorWithCode(
          'TAG_DIRECTIVE_DEFINITION_INVALID',
          logDirective('tag') +
            `Found @tag definition in service ${serviceName}, but the @tag directive definition was invalid. Please ensure the directive definition in your schema's type definitions matches the following:\n\t${printedTagDefinition}`,
          tagDirectiveDefinition,
        ),
      );
    }
  }
  return errors;
};
