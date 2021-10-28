import { DirectiveLocationEnum, GraphQLError } from "graphql";
import { FeatureDefinition, FeatureDefinitions, FeatureUrl, FeatureVersion } from "./coreSpec";
import { DirectiveDefinition, NonNullType, Schema } from "./definitions";
import { error } from "./error";
import { sameType } from "./types";
import { assert } from "./utils";

export const tagIdentity = 'https://specs.apollo.dev/tag';

export const tagLocations: DirectiveLocationEnum[] = ['FIELD_DEFINITION', 'OBJECT', 'INTERFACE', 'UNION'];

const printedTagDefinition = 'directive @tag(name: String!) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION';

export class TagSpecDefinition extends FeatureDefinition {
  constructor(version: FeatureVersion) {
    super(new FeatureUrl(tagIdentity, 'tag', version));
  }

  addElementsToSchema(schema: Schema) {
    const directive = this.addDirective(schema, 'tag').addLocations(...tagLocations);
    directive.addArgument("name", new NonNullType(schema.stringType()));
  }

  tagDirective(schema: Schema): DirectiveDefinition<{name: string}> {
    return this.directive(schema, 'tag')!;
  }

  checkCompatibleDirective(definition: DirectiveDefinition): GraphQLError | undefined {
    assert(definition.name === 'tag', () => `This method should not have been called on directive named ${definition.name}`);
    const hasUnknownArguments = Object.keys(definition.arguments()).length > 1;
    const nameArg = definition.argument('name');
    const hasValidNameArg = nameArg && sameType(nameArg.type!, new NonNullType(definition.schema()!.stringType()));
    const hasValidLocations = definition.locations.every(loc => tagLocations.includes(loc));
    if (hasUnknownArguments || !hasValidNameArg || !hasValidLocations) {
      return error(
        'TAG_DIRECTIVE_DEFINITION_INVALID',
        `Found invalid @tag directive definition. Please ensure the directive definition in your schema's definitions matches the following:\n\t${printedTagDefinition}`,
      );
    }
    return undefined;
  }
}

export const TAG_VERSIONS = new FeatureDefinitions<TagSpecDefinition>(tagIdentity)
  .add(new TagSpecDefinition(new FeatureVersion(0, 1)));
