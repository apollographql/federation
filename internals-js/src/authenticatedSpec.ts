import { DirectiveLocation, GraphQLError } from "graphql";
import {
  CorePurpose,
  FeatureDefinition,
  FeatureDefinitions,
  FeatureUrl,
  FeatureVersion,
} from "./coreSpec";
import { DirectiveDefinition, Schema } from "./definitions";
import {
  createDirectiveSpecification,
  DirectiveSpecification,
} from "./directiveAndTypeSpecification";
import { ERRORS } from "./error";
import { registerKnownFeature } from "./knownCoreFeatures";

export class AuthenticatedSpecDefinition extends FeatureDefinition {
  public static readonly directiveName = "authenticated";
  public static readonly identity = `https://specs.apollo.dev/${AuthenticatedSpecDefinition.directiveName}`;
  public static readonly locations: DirectiveLocation[] = [
    DirectiveLocation.FIELD_DEFINITION,
    DirectiveLocation.OBJECT,
    DirectiveLocation.INTERFACE,
    DirectiveLocation.SCALAR,
    DirectiveLocation.ENUM,
  ];
  private static readonly printedDefinition =
    "directive @authenticated on FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM";
  public readonly spec: DirectiveSpecification = createDirectiveSpecification({
    name: AuthenticatedSpecDefinition.directiveName,
    locations: AuthenticatedSpecDefinition.locations,
    composes: true,
    supergraphSpecification: () => AUTHENTICATED_VERSIONS.latest(),
  });

  constructor(version: FeatureVersion) {
    super(
      new FeatureUrl(
        AuthenticatedSpecDefinition.identity,
        AuthenticatedSpecDefinition.directiveName,
        version
      )
    );

    this.registerDirective(this.spec);
  }

  authenticatedDirective(
    schema: Schema
  ): DirectiveDefinition<{ name: string }> {
    return this.directive(schema, AuthenticatedSpecDefinition.directiveName)!;
  }

  public static checkCompatibleDirective(
    definition: DirectiveDefinition
  ): GraphQLError | undefined {
    const hasArguments = Object.keys(definition.arguments()).length > 0;
    const hasInvalidLocations = !definition.locations.every((loc) =>
      AuthenticatedSpecDefinition.locations.includes(loc)
    );
    if (hasArguments || hasInvalidLocations) {
      return ERRORS.DIRECTIVE_DEFINITION_INVALID.err(
        `Found invalid @authenticated directive definition. Please ensure the directive definition in your schema's definitions matches the following:\n\t${AuthenticatedSpecDefinition.printedDefinition}`
      );
    }
    return undefined;
  }

  get defaultCorePurpose(): CorePurpose {
    return 'SECURITY';
  }
}

export const AUTHENTICATED_VERSIONS =
  new FeatureDefinitions<AuthenticatedSpecDefinition>(
    AuthenticatedSpecDefinition.identity
  ).add(new AuthenticatedSpecDefinition(new FeatureVersion(1, 0)));

registerKnownFeature(AUTHENTICATED_VERSIONS);
