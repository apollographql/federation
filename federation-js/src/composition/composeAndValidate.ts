import { composeServices } from './compose';
import {
  validateComposedSchema,
  validateServicesBeforeComposition,
  validateServicesBeforeNormalization,
} from './validate';
import { ServiceDefinition } from './types';
import { normalizeTypeDefs } from './normalize';
import { printComposedSdl } from '../service/printComposedSdl';
import { GraphQLError, GraphQLSchema } from 'graphql';

export type CompositionResult = CompositionFailure | CompositionSuccess;

// Yes, it's a bit awkward that we still return a schema when errors occur.
// This is old behavior that I'm choosing not to modify for now.
export interface CompositionFailure {
  /** @deprecated Use composedSdl instead */
  schema: GraphQLSchema;
  errors: GraphQLError[];
}

export interface CompositionSuccess {
  /** @deprecated Use composedSdl instead */
  schema: GraphQLSchema;
  composedSdl: string;
}

export function compositionHasErrors(
  compositionResult: CompositionResult,
): compositionResult is CompositionFailure {
  return 'errors' in compositionResult;
}

export function composeAndValidate(
  serviceList: ServiceDefinition[],
): CompositionResult {
  const errors = validateServicesBeforeNormalization(serviceList);

  const normalizedServiceList = serviceList.map(({ typeDefs, ...rest }) => ({
    typeDefs: normalizeTypeDefs(typeDefs),
    ...rest
  }));

  // generate errors or warnings of the individual services
  errors.push(...validateServicesBeforeComposition(normalizedServiceList));

  // generate a schema and any errors or warnings
  const compositionResult = composeServices(normalizedServiceList);
  errors.push(...compositionResult.errors);

  // validate the composed schema based on service information
  errors.push(
    ...validateComposedSchema({
      schema: compositionResult.schema,
      serviceList,
    }),
  );

  if (errors.length > 0) {
    return {
      schema: compositionResult.schema,
      errors,
    };
  }

  return {
    schema: compositionResult.schema,
    composedSdl: printComposedSdl(compositionResult.schema, serviceList),
  };
}
