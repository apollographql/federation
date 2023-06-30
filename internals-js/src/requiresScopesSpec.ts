import { DirectiveLocation } from "graphql";
import {
  CorePurpose,
  FeatureDefinition,
  FeatureDefinitions,
  FeatureUrl,
  FeatureVersion,
} from "./coreSpec";
import { DirectiveDefinition, ListType, NonNullType, Schema } from "./definitions";
import {
  createDirectiveSpecification,
  DirectiveSpecification,
} from "./directiveAndTypeSpecification";
import { registerKnownFeature } from "./knownCoreFeatures";
import { ARGUMENT_COMPOSITION_STRATEGIES } from "./argumentCompositionStrategies";

export class RequiresScopesSpecDefinition extends FeatureDefinition {
  public static readonly directiveName = "requiresScopes";
  public static readonly identity =
    `https://specs.apollo.dev/${RequiresScopesSpecDefinition.directiveName}`;
  public static readonly locations: DirectiveLocation[] = [
    DirectiveLocation.FIELD_DEFINITION,
    DirectiveLocation.OBJECT,
    DirectiveLocation.INTERFACE,
    DirectiveLocation.SCALAR,
    DirectiveLocation.ENUM,
  ];
  public readonly spec: DirectiveSpecification = createDirectiveSpecification({
    name: RequiresScopesSpecDefinition.directiveName,
    args: [{
      name: 'scopes',
      type: (schema) => new NonNullType(new ListType(new NonNullType(schema.stringType()))),
      compositionStrategy: ARGUMENT_COMPOSITION_STRATEGIES.UNION,
    }],
    locations: RequiresScopesSpecDefinition.locations,
    composes: true,
    supergraphSpecification: () => REQUIRES_SCOPES_VERSIONS.latest(),
  });

  constructor(version: FeatureVersion) {
    super(
      new FeatureUrl(
        RequiresScopesSpecDefinition.identity,
        RequiresScopesSpecDefinition.directiveName,
        version
      )
    );

    this.registerDirective(this.spec);
  }

  requiresScopesDirective(
    schema: Schema
  ): DirectiveDefinition<{ name: string }> {
    return this.directive(schema, RequiresScopesSpecDefinition.directiveName)!;
  }

  get defaultCorePurpose(): CorePurpose {
    return 'SECURITY';
  }
}

export const REQUIRES_SCOPES_VERSIONS =
  new FeatureDefinitions<RequiresScopesSpecDefinition>(
    RequiresScopesSpecDefinition.identity
  ).add(new RequiresScopesSpecDefinition(new FeatureVersion(1, 0)));

registerKnownFeature(REQUIRES_SCOPES_VERSIONS);
