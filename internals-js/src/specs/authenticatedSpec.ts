import { DirectiveLocation } from "graphql";
import {
  CorePurpose,
  FeatureDefinition,
  FeatureDefinitions,
  FeatureUrl,
  FeatureVersion,
} from "./coreSpec";
import { createDirectiveSpecification } from "../directiveAndTypeSpecification";
import { registerKnownFeature } from "../knownCoreFeatures";

export class AuthenticatedSpecDefinition extends FeatureDefinition {
  public static readonly directiveName = "authenticated";
  public static readonly identity = `https://specs.apollo.dev/${AuthenticatedSpecDefinition.directiveName}`;

  constructor(version: FeatureVersion, minimumFederationVersion: FeatureVersion) {
    super(
      new FeatureUrl(
        AuthenticatedSpecDefinition.identity,
        AuthenticatedSpecDefinition.directiveName,
        version
      ),
      minimumFederationVersion,
    );

    this.registerDirective(createDirectiveSpecification({
      name: AuthenticatedSpecDefinition.directiveName,
      locations: [
        DirectiveLocation.FIELD_DEFINITION,
        DirectiveLocation.OBJECT,
        DirectiveLocation.INTERFACE,
        DirectiveLocation.SCALAR,
        DirectiveLocation.ENUM,
      ],
      composes: true,
      supergraphSpecification: () => AUTHENTICATED_VERSIONS.latest(),
    }));
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
      new FeatureVersion(0, 1),
      new FeatureVersion(2, 5),
    ),
  );

registerKnownFeature(AUTHENTICATED_VERSIONS);
