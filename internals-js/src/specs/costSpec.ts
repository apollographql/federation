import { DirectiveLocation } from 'graphql';
import { createDirectiveSpecification } from '../directiveAndTypeSpecification';
import { FeatureDefinition, FeatureDefinitions, FeatureUrl, FeatureVersion } from './coreSpec';
import { ListType, NonNullType } from '../definitions';
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
      args: [{ name: 'weight', type: (schema) => new NonNullType(schema.intType()) }],
      composes: false,
      repeatable: false,
      usesJoinDirective: true,
      supergraphSpecification: (fedVersion) => COST_VERSIONS.getMinimumRequiredVersion(fedVersion)
    }));

    this.registerDirective(createDirectiveSpecification({
      name: 'listSize',
      locations: [DirectiveLocation.FIELD_DEFINITION],
      args: [
        { name: 'assumedSize', type: (schema) => schema.intType() },
        { name: 'slicingArguments', type: (schema) => new ListType(new NonNullType(schema.stringType())) },
        { name: 'sizedFields', type: (schema) => new ListType(new NonNullType(schema.stringType())) },
        { name: 'requireOneSlicingArgument', type: (schema) => schema.booleanType(), defaultValue: true },
      ],
      composes: false,
      repeatable: false,
      usesJoinDirective: true,
      supergraphSpecification: (fedVersion) => COST_VERSIONS.getMinimumRequiredVersion(fedVersion)
    }));
  }
}

export const COST_VERSIONS = new FeatureDefinitions<CostSpecDefinition>(costIdentity)
  .add(new CostSpecDefinition(new FeatureVersion(0, 1), new FeatureVersion(2, 9)));

registerKnownFeature(COST_VERSIONS);

export interface CostDirectiveArguments {
  weight: number;
}

export interface ListSizeDirectiveArguments {
  assumedSize?: number;
  slicingArguments?: string[];
  sizedFields?: string[];
  requireOneSlicingArgument?: boolean;
}
