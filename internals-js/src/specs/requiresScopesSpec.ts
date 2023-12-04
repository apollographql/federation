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

export enum RequiresScopesTypeName {
  SCOPE = 'Scope',
}

export class RequiresScopesSpecDefinition extends FeatureDefinition {
  public static readonly directiveName = "requiresScopes";
  public static readonly identity =
    `https://specs.apollo.dev/${RequiresScopesSpecDefinition.directiveName}`;

  constructor(version: FeatureVersion) {
    super(
      new FeatureUrl(
        RequiresScopesSpecDefinition.identity,
        RequiresScopesSpecDefinition.directiveName,
        version,
      )
    );

    this.registerType(createScalarTypeSpecification({ name: RequiresScopesTypeName.SCOPE }));

    this.registerDirective(createDirectiveSpecification({
      name: RequiresScopesSpecDefinition.directiveName,
      args: [{
        name: 'scopes',
        type: (schema, feature) => {
          assert(feature, "Shouldn't be added without being attached to a @link spec");
          const scopeName = feature.typeNameInSchema(RequiresScopesTypeName.SCOPE);
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

  get defaultCorePurpose(): CorePurpose {
    return 'SECURITY';
  }
}

export const REQUIRES_SCOPES_VERSIONS =
  new FeatureDefinitions<RequiresScopesSpecDefinition>(
    RequiresScopesSpecDefinition.identity
  ).add(new RequiresScopesSpecDefinition(new FeatureVersion(0, 1)));

registerKnownFeature(REQUIRES_SCOPES_VERSIONS);
