import { DirectiveLocation, GraphQLError } from "graphql";
import { FeatureDefinition, FeatureDefinitions, FeatureUrl, FeatureVersion } from "./coreSpec";
import { DirectiveDefinition, NonNullType } from "../definitions";
import { createDirectiveSpecification, DirectiveSpecification } from "../directiveAndTypeSpecification";
import { ERRORS } from "../error";
import { registerKnownFeature } from "../knownCoreFeatures";
import { sameType } from "../types";

export const tagIdentity = 'https://specs.apollo.dev/tag';

export class TagSpecDefinition extends FeatureDefinition {
  public readonly tagLocations: DirectiveLocation[];
  public readonly tagDirectiveSpec: DirectiveSpecification;
  private readonly printedTagDefinition: string;

  constructor(version: FeatureVersion, minimumFederationVersion?: FeatureVersion) {
    super(new FeatureUrl(tagIdentity, 'tag', version), minimumFederationVersion);
    this.tagLocations = [
      DirectiveLocation.FIELD_DEFINITION,
      DirectiveLocation.OBJECT,
      DirectiveLocation.INTERFACE,
      DirectiveLocation.UNION,
    ];
    this.printedTagDefinition = 'directive @tag(name: String!) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION';
    if (!this.isV01()) {
      this.tagLocations.push(
        DirectiveLocation.ARGUMENT_DEFINITION,
        DirectiveLocation.SCALAR,
        DirectiveLocation.ENUM,
        DirectiveLocation.ENUM_VALUE,
        DirectiveLocation.INPUT_OBJECT,
        DirectiveLocation.INPUT_FIELD_DEFINITION,
      );
      this.printedTagDefinition = 'directive @tag(name: String!) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION';
      if (!this.isV02()) {
        this.tagLocations.push(DirectiveLocation.SCHEMA);
        this.printedTagDefinition = 'directive @tag(name: String!) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION | SCHEMA';
      }
    }
    this.tagDirectiveSpec = createDirectiveSpecification({
      name:'tag',
      locations: this.tagLocations,
      repeatable: true,
      args: [{ name: 'name', type: (schema) => new NonNullType(schema.stringType()) }],
      composes: true,
      supergraphSpecification: (fedVersion) => TAG_VERSIONS.getMinimumRequiredVersion(fedVersion),
    });
    this.registerDirective(this.tagDirectiveSpec);
  }

  private isV01() {
    return this.version.equals(new FeatureVersion(0, 1));
  }

  private isV02() {
    return this.version.equals(new FeatureVersion(0, 2))
  }

  checkCompatibleDirective(definition: DirectiveDefinition): GraphQLError | undefined {
    const hasUnknownArguments = Object.keys(definition.arguments()).length > 1;
    const nameArg = definition.argument('name');
    const hasValidNameArg = nameArg && sameType(nameArg.type!, new NonNullType(definition.schema().stringType()));
    const hasValidLocations = definition.locations.every(loc => this.tagLocations.includes(loc));
    if (hasUnknownArguments || !hasValidNameArg || !hasValidLocations) {
      return ERRORS.DIRECTIVE_DEFINITION_INVALID.err(
        `Found invalid @tag directive definition. Please ensure the directive definition in your schema's definitions matches the following:\n\t${this.printedTagDefinition}`,
      );
    }
    return undefined;
  }
}

export const TAG_VERSIONS = new FeatureDefinitions<TagSpecDefinition>(tagIdentity)
  .add(new TagSpecDefinition(new FeatureVersion(0, 1)))
  .add(new TagSpecDefinition(new FeatureVersion(0, 2)))
  .add(new TagSpecDefinition(new FeatureVersion(0, 3), new FeatureVersion(2, 0)));

registerKnownFeature(TAG_VERSIONS);
