import { federationDirectives } from '../../../directives';
import {
  DirectiveDefinitionNode,
  KnownDirectivesRule,
  visit,
  BREAK,
  DirectiveLocation,
} from 'graphql';
import { KnownArgumentNamesOnDirectivesRule } from 'graphql/validation/rules/KnownArgumentNamesRule';
import { ProvidedRequiredArgumentsOnDirectivesRule } from 'graphql/validation/rules/ProvidedRequiredArgumentsRule';
import { validateSDL } from 'graphql/validation/validate';
import { ServiceDefinition } from '../../types';
import {
  errorWithCode,
  isNamedTypeNode,
  isNonNullTypeNode,
  logDirective,
} from '../../utils';

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

  if (
    tagDirectiveDefinition &&
    !definitionIsCompatible(tagDirectiveDefinition)
  ) {
    const printedTagDefinition =
      'directive @tag(name: String!) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION';
    errors.push(
      errorWithCode(
        'TAG_DIRECTIVE_DEFINITION_INVALID',
        logDirective('tag') +
          `Found @tag definition in service ${serviceName}, but the @tag directive definition was invalid. Please ensure the directive definition in your schema's type definitions is compatible with the following:\n\t${printedTagDefinition}`,
        tagDirectiveDefinition,
      ),
    );
  }

  return errors.filter(
    ({ message }) =>
      !errorsMessagesToFilter.some((keyWord) => message === keyWord),
  );
};

function definitionIsCompatible(tagDefinition: DirectiveDefinitionNode) {
  // Tag definition must have a `name` argument
  const nameArg = tagDefinition.arguments?.find(
    (arg) => arg.name.value === 'name',
  );
  // `name` argument must be of type `String!`
  if (
    !nameArg ||
    !isNonNullTypeNode(nameArg?.type) ||
    !isNamedTypeNode(nameArg?.type.type) ||
    nameArg?.type.type.name.value !== 'String'
  ) {
    return false;
  }

  const validLocations = new Set<string>([
    DirectiveLocation.FIELD_DEFINITION,
    DirectiveLocation.INTERFACE,
    DirectiveLocation.OBJECT,
    DirectiveLocation.UNION,
  ]);
  // Directive locations must be one of the allowed locations in the Set above
  for (const location of tagDefinition.locations) {
    if (!validLocations.has(location.value)) return false;
  }

  return true;
}
