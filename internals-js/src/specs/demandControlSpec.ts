import { DirectiveLocation } from 'graphql';
import { createDirectiveSpecification } from '../directiveAndTypeSpecification';
import { FeatureDefinition, FeatureDefinitions, FeatureUrl, FeatureVersion } from './coreSpec';
import { ListType, NonNullType } from '../definitions';
import { registerKnownFeature } from '../knownCoreFeatures';

export const demandControlIdentity = 'https://specs.apollo.dev/demandControl';

export class DemandControlSpecDefinition extends FeatureDefinition {
  constructor(version: FeatureVersion, readonly minimumFederationVersion: FeatureVersion) {
    super(new FeatureUrl(demandControlIdentity, 'demandControl', version), minimumFederationVersion);

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
      supergraphSpecification: (fedVersion) => DEMAND_CONTROL_VERSIONS.getMinimumRequiredVersion(fedVersion)
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
      supergraphSpecification: (fedVersion) => DEMAND_CONTROL_VERSIONS.getMinimumRequiredVersion(fedVersion)
    }));
  }
}

export const DEMAND_CONTROL_VERSIONS = new FeatureDefinitions<DemandControlSpecDefinition>(demandControlIdentity)
  .add(new DemandControlSpecDefinition(new FeatureVersion(0, 1), new FeatureVersion(2, 9)));

registerKnownFeature(DEMAND_CONTROL_VERSIONS);
