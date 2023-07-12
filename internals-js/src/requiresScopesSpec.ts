import { DirectiveLocation } from "graphql";
import {
  CorePurpose,
  FeatureDefinition,
  FeatureDefinitions,
  FeatureUrl,
  FeatureVersion,
} from "./coreSpec";
import { DirectiveDefinition, ListType, NonNullType, Schema } from "./definitions";
import { createDirectiveSpecification, createScalarTypeSpecification } from "./directiveAndTypeSpecification";
import { registerKnownFeature } from "./knownCoreFeatures";
import { ARGUMENT_COMPOSITION_STRATEGIES } from "./argumentCompositionStrategies";
import { assert } from "./utils";

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

    const scopeTypeSpec = createScalarTypeSpecification({ name: RequiresScopesTypeName.SCOPE });
    this.registerType(scopeTypeSpec);

    this.registerDirective(createDirectiveSpecification({
      name: RequiresScopesSpecDefinition.directiveName,
      args: [{
        name: 'scopes',
        type: (schema, nameInSchema) => {
          const scopeName = `${nameInSchema ?? this.url.name}__${scopeTypeSpec.name}`;
          const errors = scopeTypeSpec.checkOrAdd(schema, scopeName);
          if (errors.length > 0) {
            return errors;
          }

          const scopeType = schema.type(scopeName);
          assert(scopeType, `Expected \`${scopeName}\` to be defined`);
          return new NonNullType(new ListType(new NonNullType(scopeType)));
        },
        compositionStrategy: {
          name: 'SCOPE_UNION',
          supportedTypes: (schema: Schema) => [
            new NonNullType(new ListType(new NonNullType(schema.type(RequiresScopesTypeName.SCOPE)!))),
          ],
          mergeValues: ARGUMENT_COMPOSITION_STRATEGIES.UNION.mergeValues,
        },
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

    this.registerType(createScalarTypeSpecification({ name: 'Scope' }));
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
  ).add(new RequiresScopesSpecDefinition(new FeatureVersion(0, 1)));

registerKnownFeature(REQUIRES_SCOPES_VERSIONS);
