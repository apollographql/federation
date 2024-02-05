import { DirectiveLocation, GraphQLError, Kind } from 'graphql';
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
import { ERRORS } from '../error';

export const sourceIdentity = 'https://specs.apollo.dev/source';

export class SourceSpecDefinition extends FeatureDefinition {
  constructor(version: FeatureVersion, readonly minimumFederationVersion: FeatureVersion) {
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
    // Note that this body selection can only use @key fields of the type,
    // because there are no field arguments to consume with @sourceType.
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
    sourceField.addArgument('keyTypeMap', KeyTypeMap);

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
        const featureUrl = FeatureUrl.maybeParse(url);
        if (imports && featureUrl && featureUrl.identity === sourceIdentity) {
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
    const errors = super.validateSubgraphSchema(schema);
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

    const apiNameToProtocol = new Map<string, ProtocolName>();

    if (sourceAPI) {
      this.validateSourceAPI(sourceAPI, apiNameToProtocol, errors);
    }

    if (sourceType) {
      this.validateSourceType(sourceType, apiNameToProtocol, errors);
    }

    if (sourceField) {
      this.validateSourceField(sourceField, apiNameToProtocol, errors);
    }

    return errors;
  }

  private validateSourceAPI(
    sourceAPI: DirectiveDefinition<SourceAPIDirectiveArgs>,
    apiNameToProtocol: Map<string, ProtocolName>,
    errors: GraphQLError[],
  ) {
    sourceAPI.applications().forEach(application => {
      const { name, ...rest } = application.arguments();

      if (!isValidSourceAPIName(name)) {
        errors.push(ERRORS.SOURCE_API_NAME_INVALID.err(
          `${sourceAPI}(name: ${
            JSON.stringify(name)
          }) must specify name using only [a-zA-Z0-9-_] characters`,
          { nodes: application.sourceAST },
        ));
      }

      if (apiNameToProtocol.has(name)) {
        errors.push(ERRORS.SOURCE_API_NAME_INVALID.err(
          `${sourceAPI} must specify unique name (${JSON.stringify(name)} reused)`,
          { nodes: application.sourceAST },
        ));
      }

      let protocol: ProtocolName | undefined;
      KNOWN_SOURCE_PROTOCOLS.forEach(knownProtocol => {
        if (rest[knownProtocol]) {
          if (protocol) {
            errors.push(ERRORS.SOURCE_API_PROTOCOL_INVALID.err(
              `${sourceAPI} must specify only one of ${
                KNOWN_SOURCE_PROTOCOLS.join(', ')
              } but specified both ${protocol} and ${knownProtocol}`,
              { nodes: application.sourceAST },
            ));
          }
          protocol = knownProtocol;
        }
      });

      if (protocol) {
        apiNameToProtocol.set(name, protocol);

        const protocolValue = rest[protocol];
        if (protocolValue && protocol === HTTP_PROTOCOL) {
          const { baseURL, headers } = protocolValue as HTTPSourceAPI;

          try {
            new URL(baseURL);
          } catch (e) {
            errors.push(ERRORS.SOURCE_API_HTTP_BASE_URL_INVALID.err(
              `${sourceAPI} http.baseURL ${JSON.stringify(baseURL)} must be valid URL (error: ${e.message})`,
              { nodes: application.sourceAST },
            ));
          }

          validateHTTPHeaders(headers, errors, sourceAPI.name);
        }
      } else {
        errors.push(ERRORS.SOURCE_API_PROTOCOL_INVALID.err(
          `${sourceAPI} must specify one protocol from the set {${KNOWN_SOURCE_PROTOCOLS.join(',')}}`,
          { nodes: application.sourceAST },
        ));
      }
    });
  }

  private validateSourceType(
    sourceType: DirectiveDefinition<SourceTypeDirectiveArgs>,
    apiNameToProtocol: Map<string, ProtocolName>,
    errors: GraphQLError[],
  ) {
    sourceType.applications().forEach(application => {
      const { api, selection, ...rest } = application.arguments();
      if (!api || !apiNameToProtocol.has(api)) {
        errors.push(ERRORS.SOURCE_TYPE_API_ERROR.err(
          `${sourceType} specifies unknown api ${api}`,
          { nodes: application.sourceAST },
        ));
      }

      const expectedProtocol = apiNameToProtocol.get(api) || HTTP_PROTOCOL;
      const protocolValue = expectedProtocol && rest[expectedProtocol];
      if (expectedProtocol && !protocolValue) {
        errors.push(ERRORS.SOURCE_TYPE_PROTOCOL_INVALID.err(
          `${sourceType} must specify same ${
            expectedProtocol
          } argument as corresponding @sourceAPI for api ${api}`,
          { nodes: application.sourceAST },
        ));
      }

      if (protocolValue && expectedProtocol === HTTP_PROTOCOL) {
        const { GET, POST, headers, body } = protocolValue as HTTPSourceType;

        if ([GET, POST].filter(Boolean).length !== 1) {
          errors.push(ERRORS.SOURCE_TYPE_HTTP_METHOD_INVALID.err(
            `${sourceType} must specify exactly one of http.GET or http.POST`,
            { nodes: application.sourceAST },
          ));
        } else {
          const urlPathTemplate = (GET || POST)!;
          try {
            // TODO Validate URL path template uses only available @key fields
            // of the type.
            parseURLPathTemplate(urlPathTemplate);
          } catch (e) {
            errors.push(ERRORS.SOURCE_TYPE_HTTP_PATH_INVALID.err(
              `${sourceType} http.GET or http.POST must be valid URL path template (error: ${e.message})`
            ));
          }
        }

        validateHTTPHeaders(headers, errors, sourceType.name);

        if (body) {
          if (GET) {
            errors.push(ERRORS.SOURCE_TYPE_HTTP_BODY_INVALID.err(
              `${sourceType} http.GET cannot specify http.body`,
              { nodes: application.sourceAST },
            ));
          }

          try {
            parseJSONSelection(body);
            // TODO Validate body selection matches the available fields.
          } catch (e) {
            errors.push(ERRORS.SOURCE_TYPE_HTTP_BODY_INVALID.err(
              `${sourceType} http.body not valid JSONSelection (error: ${e.message})`,
              { nodes: application.sourceAST },
            ));
          }
        }
      }

      const ast = application.parent.sourceAST;
      switch (ast?.kind) {
        case "ObjectTypeDefinition":
        case "InterfaceTypeDefinition":
          if (!ast.directives?.some(directive => directive.name.value === "key")) {
            errors.push(ERRORS.SOURCE_TYPE_ON_NON_OBJECT_OR_NON_ENTITY.err(
              `${sourceType} must be applied to an entity type that also has a @key directive`,
              { nodes: application.sourceAST },
            ));
          }
          try {
            parseJSONSelection(selection);
            // TODO Validate selection is valid JSONSelection for type.
          } catch (e) {
            errors.push(ERRORS.SOURCE_TYPE_SELECTION_INVALID.err(
              `${sourceType} selection not valid JSONSelection (error: ${e.message})`,
              { nodes: application.sourceAST },
            ));
          }
          break;
        default:
          errors.push(ERRORS.SOURCE_TYPE_ON_NON_OBJECT_OR_NON_ENTITY.err(
            `${sourceType} must be applied to object or interface type`,
            { nodes: application.sourceAST },
          ));
      }
    });
  }

  private validateSourceField(
    sourceField: DirectiveDefinition<SourceFieldDirectiveArgs>,
    apiNameToProtocol: Map<string, ProtocolName>,
    errors: GraphQLError[],
  ) {
    sourceField.applications().forEach(application => {
      const { api, selection, ...rest } = application.arguments();
      if (!api || !apiNameToProtocol.has(api)) {
        errors.push(ERRORS.SOURCE_FIELD_API_ERROR.err(
          `${sourceField} specifies unknown api ${api}`,
          { nodes: application.sourceAST },
        ));
      }

      const expectedProtocol = apiNameToProtocol.get(api) || HTTP_PROTOCOL;
      const protocolValue = expectedProtocol && rest[expectedProtocol];
      if (protocolValue && expectedProtocol === HTTP_PROTOCOL) {
        const {
          GET, POST, PUT, PATCH, DELETE,
          headers,
          body,
        } = protocolValue as HTTPSourceField;

        const usedMethods = [GET, POST, PUT, PATCH, DELETE].filter(Boolean);
        if (usedMethods.length > 1) {
          errors.push(ERRORS.SOURCE_FIELD_HTTP_METHOD_INVALID.err(
            `${sourceField} allows at most one of http.{GET,POST,PUT,PATCH,DELETE}`,
          ));
        } else if (usedMethods.length === 1) {
          const urlPathTemplate = usedMethods[0]!;
          try {
            // TODO Validate URL path template uses only available fields of
            // the type and/or argument names of the field.
            parseURLPathTemplate(urlPathTemplate);
          } catch (e) {
            errors.push(ERRORS.SOURCE_FIELD_HTTP_PATH_INVALID.err(
              `${sourceField} http.{GET,POST,PUT,PATCH,DELETE} must be valid URL path template (error: ${e.message})`
            ));
          }
        }

        validateHTTPHeaders(headers, errors, sourceField.name);

        if (body) {
          if (GET) {
            errors.push(ERRORS.SOURCE_FIELD_HTTP_BODY_INVALID.err(
              `${sourceField} http.GET cannot specify http.body`,
              { nodes: application.sourceAST },
            ));
          } else if (DELETE) {
            errors.push(ERRORS.SOURCE_FIELD_HTTP_BODY_INVALID.err(
              `${sourceField} http.DELETE cannot specify http.body`,
              { nodes: application.sourceAST },
            ));
          }

          try {
            parseJSONSelection(body);
            // TODO Validate body string matches the available fields of the
            // parent type and/or argument names of the field.
          } catch (e) {
            errors.push(ERRORS.SOURCE_FIELD_HTTP_BODY_INVALID.err(
              `${sourceField} http.body not valid JSONSelection (error: ${e.message})`,
              { nodes: application.sourceAST },
            ));
          }
        }
      }

      if (selection) {
        try {
          parseJSONSelection(selection);
          // TODO Validate selection string matches the available fields of
          // the parent type and/or argument names of the field.
        } catch (e) {
          errors.push(ERRORS.SOURCE_FIELD_SELECTION_INVALID.err(
            `${sourceField} selection not valid JSONSelection (error: ${e.message})`,
            { nodes: application.sourceAST },
          ));
        }
      }

      // @sourceField is allowed only on root Query and Mutation fields or
      // fields of entity object types.
      const fieldParent = application.parent;
      if (fieldParent.sourceAST?.kind !== Kind.FIELD_DEFINITION) {
        errors.push(ERRORS.SOURCE_FIELD_NOT_ON_ROOT_OR_ENTITY_FIELD.err(
          `${sourceField} must be applied to field`,
          { nodes: application.sourceAST },
        ));
      } else {
        const typeGrandparent = fieldParent.parent as SchemaElement<any, any>;
        if (typeGrandparent.sourceAST?.kind !== Kind.OBJECT_TYPE_DEFINITION) {
          errors.push(ERRORS.SOURCE_FIELD_NOT_ON_ROOT_OR_ENTITY_FIELD.err(
            `${sourceField} must be applied to field of object type`,
            { nodes: application.sourceAST },
          ));
        } else {
          const typeGrandparentName = typeGrandparent.sourceAST?.name.value;
          if (
            typeGrandparentName !== "Query" &&
            typeGrandparentName !== "Mutation" &&
            typeGrandparent.appliedDirectivesOf("key").length === 0
          ) {
            errors.push(ERRORS.SOURCE_FIELD_NOT_ON_ROOT_OR_ENTITY_FIELD.err(
              `${sourceField} must be applied to root Query or Mutation field or field of entity type`,
              { nodes: application.sourceAST },
            ));
          }
        }
      }
    });
  }
}

function isValidSourceAPIName(name: string): boolean {
  return /^[a-z-_][a-z0-9-_]*$/i.test(name);
}

function isValidHTTPHeaderName(name: string): boolean {
  // https://developers.cloudflare.com/rules/transform/request-header-modification/reference/header-format/
  return /^[a-zA-Z0-9-_]+$/.test(name);
}

function validateHTTPHeaders(
  headers: HTTPHeaderMapping[] | undefined,
  errors: GraphQLError[],
  directiveName: string,
) {
  if (!directiveName.startsWith('@')) {
    directiveName = '@' + directiveName;
  }
  if (headers) {
    headers.forEach(({ name, as, value }, i) => {
      // Ensure name is a valid HTTP header name.
      if (!isValidHTTPHeaderName(name)) {
        errors.push(ERRORS.SOURCE_HTTP_HEADERS_INVALID.err(
          `${directiveName} header ${JSON.stringify(headers[i])} specifies invalid name`,
        ));
      }

      if (as && !isValidHTTPHeaderName(as)) {
        errors.push(ERRORS.SOURCE_HTTP_HEADERS_INVALID.err(
          `${directiveName} header ${JSON.stringify(headers[i])} specifies invalid 'as' name`,
        ));
      }

      if (as && value) {
        errors.push(ERRORS.SOURCE_HTTP_HEADERS_INVALID.err(
          `${directiveName} header ${JSON.stringify(headers[i])} should specify at most one of 'as' or 'value'`,
        ));
      }

      // TODO Validate value is valid HTTP header value?
    });
  }
}

function parseJSONSelection(_selection: string): any {
  // TODO
}

function parseURLPathTemplate(_template: string): any {
  // TODO
}

const HTTP_PROTOCOL = "http";
const KNOWN_SOURCE_PROTOCOLS = [
  HTTP_PROTOCOL,
] as const;
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
  keyTypeMap?: KeyTypeMap;
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
