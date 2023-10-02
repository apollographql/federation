import { DirectiveLocation } from "graphql";
import {
  CorePurpose,
  FeatureDefinition,
  FeatureDefinitions,
  FeatureUrl,
  FeatureVersion,
} from "./coreSpec";
import { DirectiveDefinition, ListType, NonNullType, Schema } from "../definitions";
import { createDirectiveSpecification, createScalarTypeSpecification } from "../directiveAndTypeSpecification";
import { registerKnownFeature } from "../knownCoreFeatures";
import { ARGUMENT_COMPOSITION_STRATEGIES } from "../argumentCompositionStrategies";
import { assert } from "../utils";

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

    this.registerType(createScalarTypeSpecification({ name: Polici.SCOPE }));

    this.registerDirective(createDirectiveSpecification({
      name: PolicySpecDefinition.directiveName,
      args: [{
        name: 'scopes',
        type: (schema, feature) => {
          assert(feature, "Shouldn't be added without being attached to a @link spec");
          const scopeName = feature.typeNameInSchema(Polici.SCOPE);
          const scopeType = schema.type(scopeName);
          assert(scopeType, () => `Expected "${scopeName}" to be defined`);
          return new NonNullType(new ListType(new NonNullType(new ListType(new NonNullType(scopeType)))));
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
      supergraphSpecification: () => REQUIRES_SCOPES_VERSIONS.latest(),
    }));
  }

  requiresScopesDirective(
    schema: Schema
  ): DirectiveDefinition<{ name: string }> {
    return this.directive(schema, PolicySpecDefinition.directiveName)!;
  }

  get defaultCorePurpose(): CorePurpose {
    return 'SECURITY';
  }
}

export const REQUIRES_SCOPES_VERSIONS =
  new FeatureDefinitions<PolicySpecDefinition>(
    PolicySpecDefinition.identity
  ).add(new PolicySpecDefinition(new FeatureVersion(0, 1)));

registerKnownFeature(REQUIRES_SCOPES_VERSIONS);
