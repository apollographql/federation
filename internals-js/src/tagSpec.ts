import { DirectiveLocation, GraphQLError } from "graphql";
import { FeatureDefinition, FeatureDefinitions, FeatureUrl, FeatureVersion } from "./coreSpec";
import { DirectiveDefinition, NonNullType, Schema } from "./definitions";
import { ERRORS } from "./error";
import { sameType } from "./types";

export const tagIdentity = 'https://specs.apollo.dev/tag';

export const tagLocations = [
  DirectiveLocation.FIELD_DEFINITION,
  DirectiveLocation.OBJECT,
  DirectiveLocation.INTERFACE,
  DirectiveLocation.UNION,
];

const printedTagDefinition = 'directive @tag(name: String!) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION';

export class TagSpecDefinition extends FeatureDefinition {
  constructor(version: FeatureVersion) {
    super(new FeatureUrl(tagIdentity, 'tag', version));
  }

  addElementsToSchema(schema: Schema) {
    const directive = this.addDirective(schema, 'tag').addLocations(...tagLocations);
    directive.repeatable = true;
    directive.addArgument("name", new NonNullType(schema.stringType()));
  }

  tagDirective(schema: Schema): DirectiveDefinition<{name: string}> {
    return this.directive(schema, 'tag')!;
  }

  checkCompatibleDirective(definition: DirectiveDefinition): GraphQLError | undefined {
    const hasUnknownArguments = Object.keys(definition.arguments()).length > 1;
    const nameArg = definition.argument('name');
    const hasValidNameArg = nameArg && sameType(nameArg.type!, new NonNullType(definition.schema().stringType()));
    const hasValidLocations = definition.locations.every(loc => tagLocations.includes(loc));
    if (hasUnknownArguments || !hasValidNameArg || !hasValidLocations) {
      return ERRORS.DIRECTIVE_DEFINITION_INVALID.err({
        message: `Found invalid @tag directive definition. Please ensure the directive definition in your schema's definitions matches the following:\n\t${printedTagDefinition}`,
      }
      );
    }
    return undefined;
  }
}

export const TAG_VERSIONS = new FeatureDefinitions<TagSpecDefinition>(tagIdentity)
  .add(new TagSpecDefinition(new FeatureVersion(0, 1)));
