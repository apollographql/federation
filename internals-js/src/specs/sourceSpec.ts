import { DirectiveLocation, GraphQLError } from 'graphql';
import { FeatureDefinition, FeatureDefinitions, FeatureUrl, FeatureVersion } from "./coreSpec";
import {
  Schema,
  NonNullType,
  InputObjectType,
  InputFieldDefinition,
  ListType,
} from '../definitions';
import { registerKnownFeature } from '../knownCoreFeatures';
import { createDirectiveSpecification } from '../directiveAndTypeSpecification';

export const sourceIdentity = 'https://specs.apollo.dev/source';

export class SourceSpecDefinition extends FeatureDefinition {
  constructor(version: FeatureVersion, minimumFederationVersion?: FeatureVersion) {
    super(new FeatureUrl(sourceIdentity, 'source', version), minimumFederationVersion);

    this.registerDirective(createDirectiveSpecification({
      name: 'sourceAPI',
      locations: [DirectiveLocation.SCHEMA],
      repeatable: true,
      // We "compose" these `@source{API,Type,Field}` directives using the
      // `@join__directive` mechanism, so they do not need to be composed in the
      // way passing `composes: true` here implies.
      composes: false,
    }));

    this.registerDirective(createDirectiveSpecification({
      name: 'sourceType',
      locations: [DirectiveLocation.OBJECT, DirectiveLocation.INTERFACE],
      repeatable: true,
      composes: false,
    }));

    this.registerDirective(createDirectiveSpecification({
      name: 'sourceField',
      locations: [DirectiveLocation.FIELD_DEFINITION],
      repeatable: true,
      composes: false,
    }));
  }

  addElementsToSchema(schema: Schema): GraphQLError[] {
    const sourceAPI = this.addDirective(schema, 'sourceAPI').addLocations(DirectiveLocation.SCHEMA);
    sourceAPI.repeatable = true;

    sourceAPI.addArgument('name', new NonNullType(schema.stringType()));

    const HTTPHeaderMapping = schema.addType(new InputObjectType('HTTPHeaderMapping'));
    HTTPHeaderMapping.addField(new InputFieldDefinition('name')).type =
      new NonNullType(schema.stringType());
    HTTPHeaderMapping.addField(new InputFieldDefinition('as')).type =
      schema.stringType();
    HTTPHeaderMapping.addField(new InputFieldDefinition('value')).type =
      schema.stringType();

    const HTTPSourceAPI = schema.addType(new InputObjectType('HTTPSourceAPI'));
    HTTPSourceAPI.addField(new InputFieldDefinition('baseURL')).type =
      new NonNullType(schema.stringType());
    HTTPSourceAPI.addField(new InputFieldDefinition('headers')).type =
      new ListType(new NonNullType(HTTPHeaderMapping));
    sourceAPI.addArgument('http', HTTPSourceAPI);

    const sourceType = this.addDirective(schema, 'sourceType').addLocations(
      DirectiveLocation.OBJECT,
      DirectiveLocation.INTERFACE,
      // TODO Allow @sourceType on unions, similar to interfaces?
      // DirectiveLocation.UNION,
    );
    sourceType.repeatable = true;
    sourceType.addArgument('api', new NonNullType(schema.stringType()));

    const URLPathTemplate = this.addScalarType(schema, 'URLPathTemplate');
    const JSONSelection = this.addScalarType(schema, 'JSONSelection');
    const JSON = this.addScalarType(schema, 'JSON');

    const HTTPSourceType = schema.addType(new InputObjectType('HTTPSourceType'));
    HTTPSourceType.addField(new InputFieldDefinition('GET')).type = URLPathTemplate;
    HTTPSourceType.addField(new InputFieldDefinition('POST')).type = URLPathTemplate;
    HTTPSourceType.addField(new InputFieldDefinition('headers')).type =
      new ListType(new NonNullType(HTTPHeaderMapping));
    HTTPSourceType.addField(new InputFieldDefinition('body')).type = JSONSelection;
    sourceType.addArgument('http', HTTPSourceType);

    sourceType.addArgument('selection', new NonNullType(JSONSelection));

    const KeyTypeMap = schema.addType(new InputObjectType('KeyTypeMap'));
    KeyTypeMap.addField(new InputFieldDefinition('key')).type = new NonNullType(schema.stringType());
    KeyTypeMap.addField(new InputFieldDefinition('typeMap')).type = JSON;
    sourceType.addArgument('keyTypeMap', KeyTypeMap);

    const sourceField = this.addDirective(schema, 'sourceField').addLocations(
      DirectiveLocation.FIELD_DEFINITION,
    );
    sourceField.repeatable = true;
    sourceField.addArgument('api', new NonNullType(schema.stringType()));
    sourceField.addArgument('selection', JSONSelection);

    const HTTPSourceField = schema.addType(new InputObjectType('HTTPSourceField'));
    HTTPSourceField.addField(new InputFieldDefinition('GET')).type = URLPathTemplate;
    HTTPSourceField.addField(new InputFieldDefinition('POST')).type = URLPathTemplate;
    HTTPSourceField.addField(new InputFieldDefinition('PUT')).type = URLPathTemplate;
    HTTPSourceField.addField(new InputFieldDefinition('PATCH')).type = URLPathTemplate;
    HTTPSourceField.addField(new InputFieldDefinition('DELETE')).type = URLPathTemplate;
    HTTPSourceField.addField(new InputFieldDefinition('body')).type = JSONSelection;
    HTTPSourceField.addField(new InputFieldDefinition('headers')).type =
      new ListType(new NonNullType(HTTPHeaderMapping));
    sourceField.addArgument('http', HTTPSourceField);

    return [];
  }

  allElementNames(): string[] {
    return [
      '@sourceAPI',
      '@sourceType',
      '@sourceField',
      // 'JSONSelection',
      // 'URLPathTemplate',
      // 'JSON',
      // 'HTTPHeaderMapping',
      // 'HTTPSourceAPI',
      // 'HTTPSourceType',
      // 'HTTPSourceField',
      // 'KeyTypeMap',
    ];
  }

  sourceAPIDirective(schema: Schema) {
    return this.directive(schema, 'sourceAPI')!;
  }

  sourceTypeDirective(schema: Schema) {
    return this.directive(schema, 'sourceType')!;
  }

  sourceFieldDirective(schema: Schema) {
    return this.directive(schema, 'sourceField')!;
  }
}

export const SOURCE_VERSIONS = new FeatureDefinitions<SourceSpecDefinition>(sourceIdentity)
  .add(new SourceSpecDefinition(new FeatureVersion(0, 1)));

registerKnownFeature(SOURCE_VERSIONS);
