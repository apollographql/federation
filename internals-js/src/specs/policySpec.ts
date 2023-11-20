import { DirectiveLocation } from "graphql";
import {
  CorePurpose,
  FeatureDefinition,
  FeatureDefinitions,
  FeatureUrl,
  FeatureVersion,
} from "./coreSpec";
import { ListType, NonNullType } from "../definitions";
import { createDirectiveSpecification, createScalarTypeSpecification } from "../directiveAndTypeSpecification";
import { registerKnownFeature } from "../knownCoreFeatures";
import { ARGUMENT_COMPOSITION_STRATEGIES } from "../argumentCompositionStrategies";
import { assert } from "../utils";

export enum PolicyTypeName {
  POLICY = 'Policy',
}
export class PolicySpecDefinition extends FeatureDefinition {
  public static readonly directiveName = "policy";
  public static readonly identity =
    `https://specs.apollo.dev/${PolicySpecDefinition.directiveName}`;

  constructor(version: FeatureVersion) {
    super(
      new FeatureUrl(
        PolicySpecDefinition.identity,
        PolicySpecDefinition.directiveName,
        version,
      )
    );

    this.registerType(createScalarTypeSpecification({ name: PolicyTypeName.POLICY }));

    this.registerDirective(createDirectiveSpecification({
      name: PolicySpecDefinition.directiveName,
      args: [{
        name: 'policies',
        type: (schema, feature) => {
          assert(feature, "Shouldn't be added without being attached to a @link spec");
          const policyName = feature.typeNameInSchema(PolicyTypeName.POLICY);
          const PolicyType = schema.type(policyName);
          assert(PolicyType, () => `Expected "${policyName}" to be defined`);
          return new NonNullType(new ListType(new NonNullType(new ListType(new NonNullType(PolicyType)))));
        },
        compositionStrategy: ARGUMENT_COMPOSITION_STRATEGIES.UNION,
      }],
      locations: [
        DirectiveLocation.FIELD_DEFINITION,
        DirectiveLocation.OBJECT,
        DirectiveLocation.INTERFACE,
        DirectiveLocation.SCALAR,
        DirectiveLocation.ENUM,
      ],
      composes: true,
      supergraphSpecification: () => POLICY_VERSIONS.latest(),
    }));
  }

  get defaultCorePurpose(): CorePurpose {
    return 'SECURITY';
  }
}

export const POLICY_VERSIONS =
  new FeatureDefinitions<PolicySpecDefinition>(
    PolicySpecDefinition.identity
  ).add(new PolicySpecDefinition(new FeatureVersion(0, 1)));

registerKnownFeature(POLICY_VERSIONS);
