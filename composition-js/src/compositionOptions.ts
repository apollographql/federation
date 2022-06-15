import {
  didYouMean,
  DirectiveDefinition,
  ERRORS,
  executableDirectiveLocations,
  Subgraphs,
  suggestionList,
  type SubtypingRule,
} from "@apollo/federation-internals";
import { GraphQLError } from 'graphql';

export type CompositionOptions = {
  mergeDirectives?: string[],
  allowedFieldTypeMergingSubtypingRules?: SubtypingRule[],
};

export const validateCompositionOptions = (toMerge: Subgraphs, options?: CompositionOptions): GraphQLError[] => {
  // for mergeDirectives, we want to validate that every directive specified starts with a '@'
  // and exists on some subgraph. Also ensure that non of the directives are builtin or federation directives
  const subgraphs = toMerge.values();
  const mergeDirectives = options?.mergeDirectives ?? [];
  const errors: GraphQLError[] = [];
  mergeDirectives.forEach(directiveName => {
    if (directiveName[0] !== '@') {
      errors.push(ERRORS.MERGE_DIRECTIVES_NO_LEADING_AT.err({ message: `Directive "${directiveName}" in "mergeDirectives" argument does not begin with a "@"` }));
    } else {
      const directiveNameWithoutAt = directiveName.slice(1);

      // for the directive specified, get the DirectiveDefinition for each subgraph it appears in
      const subgraphDirectives = subgraphs
        .map(sg => sg.schema.directive(directiveNameWithoutAt))
        .filter((directive): directive is DirectiveDefinition => directive !== undefined);

      if (subgraphDirectives.length === 0) {
        // If the directive does not appear in any subgraph, throw an error. Provide a suggestion if we think it's a typo.
        const allDirectives = new Set<string>();
        subgraphs.forEach(sg => {
          sg.schema.allDirectives().forEach(directive => {
            allDirectives.add(`@${directive.name}`);
          });
        });

        const suggestions = suggestionList(directiveNameWithoutAt, Array.from(allDirectives));
        errors.push(ERRORS.MERGE_DIRECTIVES_DIRECTIVE_DOES_NOT_EXIST.err({ message: `Directive "${directiveName}" in "mergeDirectives" argument does not exist in any subgraph. ${didYouMean(suggestions)}` }));
      } else if (subgraphDirectives.some(directive => directive.isBuiltIn)) {
        // reject builtin directives
        errors.push(ERRORS.MERGE_DIRECTIVES_BUILT_IN_DIRECTIVE.err({ message: `Directive "${directiveName}" cannot be specified in "mergeDirectives" argument because it is a built in directive` }));
      } else if (subgraphDirectives.every(directive => directive.locations.every(loc => executableDirectiveLocations.includes(loc)))) {
        // reject directives that have no type system locations since executable directives are already composed
        errors.push(ERRORS.MERGE_DIRECTIVES_NO_EXECUTABLE_DIRECTIVES.err({ message: `Directive "${directiveName}" cannot be specified in "mergeDirectives" argument because all its locations are executable`}));
      } else if (subgraphDirectives.some(sgDirective => sgDirective.schema().coreFeatures && sgDirective.schema().coreFeatures?.sourceFeature(sgDirective) !== undefined)) {
        // don't allow directives that originate from a core feature
        errors.push(ERRORS.MERGE_DIRECTIVES_NO_CORE_DIRECTIVES.err({ message: `Directive "${directiveName}" cannot be specified in "mergeDirectives" argument because it is linked via a core feature in at least one subgraph` }));
      }
    }
  });
  return errors;
};
