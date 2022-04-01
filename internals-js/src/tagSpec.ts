import { DirectiveLocation, GraphQLError } from "graphql";
import { FeatureDefinition, FeatureDefinitions, FeatureUrl, FeatureVersion } from "./coreSpec";
import { DirectiveDefinition, NonNullType, Schema } from "./definitions";
import { createDirectiveSpecification, DirectiveSpecification } from "./directiveAndTypeSpecification";
import { ERRORS } from "./error";
import { registerKnownFeature } from "./knownCoreFeatures";
import { sameType } from "./types";

export const tagIdentity = 'https://specs.apollo.dev/tag';

export class TagSpecDefinition extends FeatureDefinition {
  public readonly tagLocations: DirectiveLocation[];
  public readonly tagDirectiveSpec: DirectiveSpecification;
  private readonly printedTagDefinition: string;

  constructor(version: FeatureVersion) {
    super(new FeatureUrl(tagIdentity, 'tag', version));
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
    }
    this.tagDirectiveSpec = createDirectiveSpecification({
      name:'tag',
      locations: this.tagLocations,
      repeatable: true,
      argumentFct: (schema) => ({
        args: [{ name: 'name', type: new NonNullType(schema.stringType()) }],
        errors: [],
      }),
    });
  }

  private isV01() {
    return this.version.equals(new FeatureVersion(0, 1));
  }

  addElementsToSchema(schema: Schema): GraphQLError[] {
    return this.addDirectiveSpec(schema, this.tagDirectiveSpec);
  }

  tagDirective(schema: Schema): DirectiveDefinition<{name: string}> {
    return this.directive(schema, 'tag')!;
  }

  checkCompatibleDirective(definition: DirectiveDefinition): GraphQLError | undefined {
    const hasUnknownArguments = Object.keys(definition.arguments()).length > 1;
    const nameArg = definition.argument('name');
    const hasValidNameArg = nameArg && sameType(nameArg.type!, new NonNullType(definition.schema().stringType()));
    const hasValidLocations = definition.locations.every(loc => this.tagLocations.includes(loc));
    if (hasUnknownArguments || !hasValidNameArg || !hasValidLocations) {
      return ERRORS.DIRECTIVE_DEFINITION_INVALID.err({
        message: `Found invalid @tag directive definition. Please ensure the directive definition in your schema's definitions matches the following:\n\t${this.printedTagDefinition}`,
      }
      );
    }
    return undefined;
  }

  allElementNames(): string[] {
    return ["@tag"];
  }
}

export const TAG_VERSIONS = new FeatureDefinitions<TagSpecDefinition>(tagIdentity)
  .add(new TagSpecDefinition(new FeatureVersion(0, 1)))
  .add(new TagSpecDefinition(new FeatureVersion(0, 2)));

registerKnownFeature(TAG_VERSIONS);
