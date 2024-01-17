import { DirectiveLocation, GraphQLError } from 'graphql';
import { FeatureDefinition, FeatureDefinitions, FeatureUrl, FeatureVersion, LinkDirectiveArgs } from "./coreSpec";
import {
  Schema,
  NonNullType,
  InputObjectType,
  InputFieldDefinition,
  ListType,
  DirectiveDefinition,
  SchemaElement,
} from '../definitions';
import { registerKnownFeature } from '../knownCoreFeatures';
import { createDirectiveSpecification } from '../directiveAndTypeSpecification';
import { parseJSONSelection } from '../parsing/JSONSelection';
import { parseURLPathTemplate } from '../parsing/URLPathTemplate';

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
    KeyTypeMap.addField(new InputFieldDefinition('typeMap')).type =
      // TypenameKeyMap is a scalar type similar to a JSON dictionary, where the
      // keys are __typename strings and the values are values of the key field.
      this.addScalarType(schema, 'TypenameKeyMap');
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
    return this.directive<SourceAPIDirectiveArgs>(schema, 'sourceAPI')!;
  }

  sourceTypeDirective(schema: Schema) {
    return this.directive<SourceTypeDirectiveArgs>(schema, 'sourceType')!;
  }

  sourceFieldDirective(schema: Schema) {
    return this.directive<SourceFieldDirectiveArgs>(schema, 'sourceField')!;
  }

  private getSourceDirectives(schema: Schema) {
    const result: {
      sourceAPI?: DirectiveDefinition<SourceAPIDirectiveArgs>;
      sourceType?: DirectiveDefinition<SourceTypeDirectiveArgs>;
      sourceField?: DirectiveDefinition<SourceFieldDirectiveArgs>;
    } = {};

    schema.schemaDefinition.appliedDirectivesOf<LinkDirectiveArgs>('link')
      .forEach(linkDirective => {
        const { url, import: imports } = linkDirective.arguments();
        if (imports && FeatureUrl.parse(url).identity === sourceIdentity) {
          imports.forEach(nameOrRename => {
            const originalName = typeof nameOrRename === 'string' ? nameOrRename : nameOrRename.name;
            const importedName = typeof nameOrRename === 'string' ? nameOrRename : nameOrRename.as || originalName;
            const importedNameWithoutAt = importedName.replace(/^@/, '');

            if (originalName === '@sourceAPI') {
              result.sourceAPI = schema.directive(importedNameWithoutAt) as DirectiveDefinition<SourceAPIDirectiveArgs>;
            } else if (originalName === '@sourceType') {
              result.sourceType = schema.directive(importedNameWithoutAt) as DirectiveDefinition<SourceTypeDirectiveArgs>;
            } else if (originalName === '@sourceField') {
              result.sourceField = schema.directive(importedNameWithoutAt) as DirectiveDefinition<SourceFieldDirectiveArgs>;
            }
          });
        }
      });

    return result;
  }

  override validateSubgraphSchema(schema: Schema): GraphQLError[] {
    const {
      sourceAPI,
      sourceType,
      sourceField,
    } = this.getSourceDirectives(schema);

    if (!(sourceAPI || sourceType || sourceField)) {
      // If none of the @source* directives are present, nothing needs
      // validating.
      return [];
    }

    const errors: GraphQLError[] = [];
    const apiNameToProtocol = new Map<string, ProtocolName>();

    if (sourceAPI) {
      sourceAPI.applications().forEach(application => {
        const { name, ...rest } = application.arguments();

        if (apiNameToProtocol.has(name)) {
          errors.push(new GraphQLError(`${sourceAPI.name} must specify unique name`));
        }

        // Ensure name is a valid GraphQL identifier.
        if (!/^[a-zA-Z_][0-9a-zA-Z_]*$/.test(name)) {
          errors.push(new GraphQLError(`${sourceAPI.name}(name: ${
            JSON.stringify(name)
          }) must be valid GraphQL identifier`));
        }

        let protocol: ProtocolName | undefined;
        KNOWN_SOURCE_PROTOCOLS.forEach(knownProtocol => {
          if (rest[knownProtocol]) {
            if (protocol) {
              errors.push(new GraphQLError(
                `${sourceAPI.name} must specify only one of ${KNOWN_SOURCE_PROTOCOLS.join(', ')}`,
              ));
            }
            protocol = knownProtocol;
          }
        });

        if (protocol) {
          apiNameToProtocol.set(name, protocol);

          const protocolValue = rest[protocol];
          if (protocolValue && protocol === "http") {
            const { baseURL, headers } = protocolValue as HTTPSourceAPI;

            try {
              new URL(baseURL);
            } catch (e) {
              errors.push(new GraphQLError(`${sourceAPI.name} http.baseURL ${
                JSON.stringify(baseURL)
              } must be valid URL`));
            }

            validateHTTPHeaders(headers, errors, sourceAPI.name);
          }
        } else {
          errors.push(new GraphQLError(
            `${sourceAPI.name} must specify one of ${KNOWN_SOURCE_PROTOCOLS.join(', ')}`,
          ));
        }
      });
    }

    if (sourceType) {
      sourceType.applications().forEach(application => {
        const { api, ...rest } = application.arguments();
        if (!api || !apiNameToProtocol.has(api)) {
          errors.push(new GraphQLError(`${sourceType.name} specifies unknown api ${api}`));
        } else {
          const expectedProtocol = apiNameToProtocol.get(api);
          const protocolValue = expectedProtocol && rest[expectedProtocol];
          if (expectedProtocol && !protocolValue) {
            errors.push(new GraphQLError(
              `${sourceType.name} must specify same ${
                expectedProtocol
              } argument as corresponding ${
                sourceAPI!.name
              } for api ${api}`,
            ));
          }

          if (protocolValue && expectedProtocol === "http") {
            const { GET, POST, headers, body } = protocolValue as HTTPSourceType;

            if ([GET, POST].filter(Boolean).length !== 1) {
              errors.push(new GraphQLError(
                `${sourceType.name} must specify exactly one of http.GET or http.POST`,
              ));
            } else {
              const urlPathTemplate = (GET || POST)!;
              try {
                // TODO Validate URL path template uses only available fields of
                // the type.
                parseURLPathTemplate(urlPathTemplate);
              } catch (e) {
                errors.push(new GraphQLError(
                  `${sourceType.name} http.GET or http.POST must be valid URL path template`,
                ));
              }
            }

            validateHTTPHeaders(headers, errors, sourceType.name);

            if (body) {
              try {
                parseJSONSelection(body);
                // TODO Validate body selection matches the available fields.
              } catch (e) {
                errors.push(new GraphQLError(
                  `${sourceType.name} http.body not valid JSONSelection: ${
                    e.message
                  }`,
                ));
              }
            }
          }
        }

        const ast = application.parent.sourceAST;
        switch (ast?.kind) {
          case "ObjectTypeDefinition":
          case "InterfaceTypeDefinition":
            if (!ast.directives?.some(directive => directive.name.value === "key")) {
              errors.push(new GraphQLError(
                `${sourceType.name} must be applied to an entity type that also has a @key directive`,
              ));
            }
            // TODO Validate selection is valid JSONSelection for type.
            break;
          default:
            errors.push(new GraphQLError(
              `${sourceType.name} must be applied to object or interface type`,
            ));
        }
      });
    }

    if (sourceField) {
      sourceField.applications().forEach(application => {
        const { api, selection, ...rest } = application.arguments();
        if (!api || !apiNameToProtocol.has(api)) {
          errors.push(new GraphQLError(`${sourceField.name} specifies unknown api ${api}`));
        } else {
          const expectedProtocol = apiNameToProtocol.get(api);
          const protocolValue = expectedProtocol && rest[expectedProtocol];
          if (protocolValue && expectedProtocol === "http") {
            const {
              GET, POST, PUT, PATCH, DELETE,
              headers,
              body,
            } = protocolValue as HTTPSourceField;

            const usedMethods = [GET, POST, PUT, PATCH, DELETE].filter(Boolean);
            if (usedMethods.length > 1) {
              errors.push(new GraphQLError(`${
                sourceField.name
              } allows at most one of http.GET, http.POST, http.PUT, http.PATCH, and http.DELETE`));
            } else if (usedMethods.length === 1) {
              const urlPathTemplate = usedMethods[0]!;
              try {
                // TODO Validate URL path template uses only available fields of
                // the type and/or argument names of the field.
                parseURLPathTemplate(urlPathTemplate);
              } catch (e) {
                errors.push(new GraphQLError(
                  `${sourceField.name} http.GET, http.POST, http.PUT, http.PATCH, or http.DELETE must be valid URL path template`,
                ));
              }
            }

            validateHTTPHeaders(headers, errors, sourceField.name);

            if (body) {
              try {
                parseJSONSelection(body);
                // TODO Validate body string matches the available fields of the
                // parent type and/or argument names of the field.
              } catch (e) {
                errors.push(new GraphQLError(
                  `${sourceField.name} http.body not valid JSONSelection: ${
                    e.message
                  }`,
                ));
              }
            }
          }
        }

        if (selection) {
          try {
            parseJSONSelection(selection);
            // TODO Validate selection string matches the available fields of
            // the parent type and/or argument names of the field.
          } catch (e) {
            errors.push(new GraphQLError(
              `${sourceField.name} selection not valid JSONSelection: ${
                e.message
              }`,
            ));
          }
        }

        // @sourceField is allowed only on root Query and Mutation fields or
        // fields of entity object types.
        const fieldParent = application.parent;
        if (fieldParent.sourceAST?.kind !== "FieldDefinition") {
          errors.push(new GraphQLError(
            `${sourceField.name} must be applied to field`,
          ));
        } else {
          const typeGrandparent = fieldParent.parent as SchemaElement<any, any>;
          if (typeGrandparent.sourceAST?.kind !== "ObjectTypeDefinition") {
            errors.push(new GraphQLError(
              `${sourceField.name} must be applied to field of object type`,
            ));
          } else {
            const typeGrandparentName = typeGrandparent.sourceAST?.name.value;
            if (
              typeGrandparentName !== "Query" &&
              typeGrandparentName !== "Mutation" &&
              typeGrandparent.appliedDirectivesOf("key").length === 0
            ) {
              errors.push(new GraphQLError(
                `${sourceField.name} must be applied to root Query or Mutation field or field of entity type`,
              ));
            }
          }
        }
      });
    }

    return errors;
  }
}

function validateHTTPHeaders(
  headers: HTTPHeaderMapping[] | undefined,
  errors: GraphQLError[],
  directiveName: string,
) {
  if (headers) {
    headers.forEach(({ name, as, value }, i) => {
      // Ensure name is a valid HTTP header name.
      if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
        errors.push(new GraphQLError(`${directiveName} headers[${i}].name == ${
          JSON.stringify(name)
        } is not valid HTTP header name`));
      }

      if (!as === !value) {
        errors.push(new GraphQLError(`${directiveName} headers[${i}] must specify exactly one of as or value`));
      }

      // TODO Validate value is valid HTTP header value?
    });
  }
}

const KNOWN_SOURCE_PROTOCOLS = ["http"] as const;
type ProtocolName = (typeof KNOWN_SOURCE_PROTOCOLS)[number];

export type SourceAPIDirectiveArgs = {
  name: string;
  http?: HTTPSourceAPI;
};

export type HTTPSourceAPI = {
  baseURL: string;
  headers?: HTTPHeaderMapping[];
};

export type HTTPHeaderMapping = {
  name: string;
  as?: string;
  value?: string;
};

export type SourceTypeDirectiveArgs = {
  api: string;
  http?: HTTPSourceType;
  selection: JSONSelection;
  keyTypeMap?: KeyTypeMap;
};

export type HTTPSourceType = {
  GET?: URLPathTemplate;
  POST?: URLPathTemplate;
  headers?: HTTPHeaderMapping[];
  body?: JSONSelection;
};

type URLPathTemplate = string;
type JSONSelection = string;

type KeyTypeMap = {
  key: string;
  typeMap: {
    [__typename: string]: string;
  };
};

export type SourceFieldDirectiveArgs = {
  api: string;
  http?: HTTPSourceField;
  selection?: JSONSelection;
};

export type HTTPSourceField = {
  GET?: URLPathTemplate;
  POST?: URLPathTemplate;
  PUT?: URLPathTemplate;
  PATCH?: URLPathTemplate;
  DELETE?: URLPathTemplate;
  body?: JSONSelection;
  headers?: HTTPHeaderMapping[];
};

export const SOURCE_VERSIONS = new FeatureDefinitions<SourceSpecDefinition>(sourceIdentity)
  .add(new SourceSpecDefinition(new FeatureVersion(0, 1), new FeatureVersion(2, 7)));

registerKnownFeature(SOURCE_VERSIONS);
