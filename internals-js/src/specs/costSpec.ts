import { DirectiveLocation } from 'graphql';
import { createDirectiveSpecification } from '../directiveAndTypeSpecification';
import { FeatureDefinition, FeatureDefinitions, FeatureUrl, FeatureVersion } from './coreSpec';
import { NonNullType } from '../definitions';
import { registerKnownFeature } from '../knownCoreFeatures';

export const costIdentity = 'https://specs.apollo.dev/cost';

export class CostSpecDefinition extends FeatureDefinition {
  constructor(version: FeatureVersion, readonly minimumFederationVersion: FeatureVersion) {
    super(new FeatureUrl(costIdentity, 'cost', version), minimumFederationVersion);

    this.registerDirective(createDirectiveSpecification({
      name: 'cost',
      locations: [
        DirectiveLocation.ARGUMENT_DEFINITION,
        DirectiveLocation.ENUM,
        DirectiveLocation.FIELD_DEFINITION,
        DirectiveLocation.INPUT_FIELD_DEFINITION,
        DirectiveLocation.OBJECT,
        DirectiveLocation.SCALAR
      ],
      args: [{ name: 'weight', type: (schema) => new NonNullType(schema.stringType()) }],
      composes: true,
      repeatable: false,
      supergraphSpecification: (fedVersion) => COST_VERSIONS.getMinimumRequiredVersion(fedVersion)
    }));
  }
}

export const COST_VERSIONS = new FeatureDefinitions<CostSpecDefinition>(costIdentity)
  .add(new CostSpecDefinition(new FeatureVersion(0, 1), new FeatureVersion(2, 8)));

registerKnownFeature(COST_VERSIONS);
