import { DirectiveLocation } from 'graphql';
import { createDirectiveSpecification } from '../directiveAndTypeSpecification';
import { FeatureDefinition, FeatureDefinitions, FeatureUrl, FeatureVersion } from './coreSpec';
import { ListType, NonNullType } from '../definitions';
import { registerKnownFeature } from '../knownCoreFeatures';

export const listSizeIdentity = 'https://specs.apollo.dev/listSize';

export class ListSizeSpecDefinition extends FeatureDefinition {
  constructor(version: FeatureVersion, readonly minimumFederationVersion: FeatureVersion) {
    super(new FeatureUrl(listSizeIdentity, 'listSize', version), minimumFederationVersion);

    this.registerDirective(createDirectiveSpecification({
      name: 'listSize',
      locations: [DirectiveLocation.FIELD_DEFINITION],
      args: [
        { name: 'assumedSize', type: (schema) => schema.intType() },
        { name: 'slicingArguments', type: (schema) => new ListType(new NonNullType(schema.stringType())) },
        { name: 'sizedFields', type: (schema) => new ListType(new NonNullType(schema.stringType())) },
        { name: 'requireOneSlicingArgument', type: (schema) => schema.booleanType(), defaultValue: true },
      ],
      composes: true,
      repeatable: false,
      supergraphSpecification: (fedVersion) => LIST_SIZE_VERSIONS.getMinimumRequiredVersion(fedVersion)
    }));
  }
}

export const LIST_SIZE_VERSIONS = new FeatureDefinitions<ListSizeSpecDefinition>(listSizeIdentity)
  .add(new ListSizeSpecDefinition(new FeatureVersion(0, 1), new FeatureVersion(2, 8)));

registerKnownFeature(LIST_SIZE_VERSIONS);
