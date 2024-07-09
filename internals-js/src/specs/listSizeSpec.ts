import { DirectiveLocation } from 'graphql';
import { createDirectiveSpecification } from '../directiveAndTypeSpecification';
import { FeatureDefinition, FeatureDefinitions, FeatureUrl, FeatureVersion } from './coreSpec';
import { ListType, NonNullType } from '../definitions';
import { registerKnownFeature } from '../knownCoreFeatures';
import { ARGUMENT_COMPOSITION_STRATEGIES } from '../argumentCompositionStrategies';

export const listSizeIdentity = 'https://specs.apollo.dev/listSize';

export class ListSizeSpecDefinition extends FeatureDefinition {
  constructor(version: FeatureVersion, readonly minimumFederationVersion: FeatureVersion) {
    super(new FeatureUrl(listSizeIdentity, 'listSize', version), minimumFederationVersion);

    this.registerDirective(createDirectiveSpecification({
      name: 'listSize',
      locations: [DirectiveLocation.FIELD_DEFINITION],
      args: [
        { name: 'assumedSize', type: (schema) => schema.intType(), compositionStrategy: ARGUMENT_COMPOSITION_STRATEGIES.NULLABLE_MAX },
        { name: 'slicingArguments', type: (schema) => new ListType(new NonNullType(schema.stringType())), compositionStrategy: ARGUMENT_COMPOSITION_STRATEGIES.NULLABLE_UNION },
        { name: 'sizedFields', type: (schema) => new ListType(new NonNullType(schema.stringType())), compositionStrategy: ARGUMENT_COMPOSITION_STRATEGIES.NULLABLE_UNION },
        { name: 'requireOneSlicingArgument', type: (schema) => schema.booleanType(), defaultValue: true, compositionStrategy: ARGUMENT_COMPOSITION_STRATEGIES.NULLABLE_OR },
      ],
      composes: true,
      repeatable: false,
      supergraphSpecification: (fedVersion) => LIST_SIZE_VERSIONS.getMinimumRequiredVersion(fedVersion)
    }));
  }
}

export const LIST_SIZE_VERSIONS = new FeatureDefinitions<ListSizeSpecDefinition>(listSizeIdentity)
  .add(new ListSizeSpecDefinition(new FeatureVersion(0, 1), new FeatureVersion(2, 9)));

registerKnownFeature(LIST_SIZE_VERSIONS);

export interface ListSizeDirectiveArguments {
  assumedSize?: number;
  slicingArguments?: string[];
  sizedFields?: string[];
  requireOneSlicingArgument?: boolean;
}
