import { DirectiveLocation } from "graphql";
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
  public readonly spec: DirectiveSpecification = createDirectiveSpecification({
    name: AuthenticatedSpecDefinition.directiveName,
    locations: AuthenticatedSpecDefinition.locations,
    composes: true,
    supergraphSpecification: () => AUTHENTICATED_VERSIONS.latest(),
  });

  constructor(version: FeatureVersion, minimumFederationVersion: FeatureVersion) {
    super(
      new FeatureUrl(
        AuthenticatedSpecDefinition.identity,
        AuthenticatedSpecDefinition.directiveName,
        version
      ),
      minimumFederationVersion,
    );

    this.registerDirective(this.spec);
  }

  authenticatedDirective(
    schema: Schema
  ): DirectiveDefinition<{ name: string }> {
    return this.directive(schema, AuthenticatedSpecDefinition.directiveName)!;
  }

  get defaultCorePurpose(): CorePurpose {
    return 'SECURITY';
  }
}

export const AUTHENTICATED_VERSIONS =
  new FeatureDefinitions<AuthenticatedSpecDefinition>(
    AuthenticatedSpecDefinition.identity
  ).add(
    new AuthenticatedSpecDefinition(
      new FeatureVersion(1, 0),
      new FeatureVersion(2, 5),
    ),
  );

registerKnownFeature(AUTHENTICATED_VERSIONS);
