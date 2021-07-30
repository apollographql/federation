import { federationDirectives } from '../../../directives';
import {
  DirectiveDefinitionNode,
  KnownDirectivesRule,
  visit,
  BREAK,
  print,
} from 'graphql';
import { KnownArgumentNamesOnDirectivesRule } from 'graphql/validation/rules/KnownArgumentNamesRule';
import { ProvidedRequiredArgumentsOnDirectivesRule } from 'graphql/validation/rules/ProvidedRequiredArgumentsRule';
import { validateSDL } from 'graphql/validation/validate';
import { ServiceDefinition } from '../../types';
import { errorWithCode, logDirective, stripDescriptions } from '../../utils';

// Likely brittle but also will be very obvious if this breaks. Based on the
// content of the error message itself to remove expected errors related to
// omitted federation directives.
const errorsMessagesToFilter = federationDirectives.map(
  (directive) => `Unknown directive "@${directive.name}".`,
);
/**
 * If there are tag usages in the service definition, check that the tag directive
 * definition is included and correct.
 */
export const tagDirective = ({
  name: serviceName,
  typeDefs,
}: ServiceDefinition) => {
  // TODO(#884): Remove this bit once we start running all the graphql-js validations
  // together, separate from this validator.
  const directiveRules = [
    KnownArgumentNamesOnDirectivesRule,
    KnownDirectivesRule,
    ProvidedRequiredArgumentsOnDirectivesRule,
  ];

  const errors = validateSDL(typeDefs, undefined, directiveRules);

  let tagDirectiveDefinition: DirectiveDefinitionNode | undefined;
  visit(typeDefs, {
    DirectiveDefinition(node) {
      if (node.name.value === 'tag') {
        tagDirectiveDefinition = node;
        return BREAK;
      }
    },
  });

  // Ensure the tag directive definition is correct
  if (tagDirectiveDefinition) {
    const printedTagDefinition =
      'directive @tag(name: String!) repeatable on FIELD_DEFINITION';

    if (
      print(stripDescriptions(tagDirectiveDefinition)) !== printedTagDefinition
    ) {
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

  return errors.filter(
    ({ message }) =>
      !errorsMessagesToFilter.some((keyWord) => message === keyWord),
  );
};
