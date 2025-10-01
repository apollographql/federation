import { DirectiveLocation } from 'graphql';
import {
  CorePurpose,
  FeatureDefinition,
  FeatureDefinitions,
  FeatureUrl,
  FeatureVersion,
} from './coreSpec';
import {
  CoreFeature,
  InputObjectType,
  ListType, NamedType,
  NonNullType, ScalarType, Schema,
} from '../definitions';
import { registerKnownFeature } from '../knownCoreFeatures';
import {
  createDirectiveSpecification, createInputObjectTypeSpecification,
  createScalarTypeSpecification,
} from '../directiveAndTypeSpecification';
import {assert} from "../utils";

export const connectIdentity = 'https://specs.apollo.dev/connect';

const CONNECT = 'connect';
const SOURCE = 'source';
const URL_PATH_TEMPLATE = 'URLPathTemplate';
const JSON_SELECTION = 'JSONSelection';
const CONNECT_HTTP = 'ConnectHTTP';
const CONNECT_BATCH = 'ConnectBatch';
const CONNECTOR_ERRORS = "ConnectorErrors";
const SOURCE_HTTP = "SourceHTTP";
const HTTP_HEADER_MAPPING = 'HTTPHeaderMapping';

export class ConnectSpecDefinition extends FeatureDefinition {
  constructor(
    version: FeatureVersion,
    readonly minimumFederationVersion: FeatureVersion,
  ) {
    super(
      new FeatureUrl(connectIdentity, CONNECT, version),
      minimumFederationVersion,
    );

    function lookupFeatureTypeInSchema<T extends NamedType>(name: string, kind: T['kind'], schema: Schema, feature?: CoreFeature): T {
      assert(feature, `Shouldn't be added without being attached to a @connect spec`);
      const typeName = feature.typeNameInSchema(name);
      const type = schema.typeOfKind<T>(typeName, kind);
      assert(type, () => `Expected "${typeName}" to be defined`);
      return type;
    }

    /* scalar URLPathTemplate */
    this.registerType(
        createScalarTypeSpecification({ name: URL_PATH_TEMPLATE }),
    );
    /* scalar JSONSelection */
    this.registerType(createScalarTypeSpecification({ name: JSON_SELECTION }));

    /*
      input ConnectorErrors {
        message: JSONSelection
        extensions: JSONSelection
      }
    */
    this.registerType(
        createInputObjectTypeSpecification({
          name: CONNECTOR_ERRORS,
          inputFieldsFct: (schema, feature) => {
            const jsonSelectionType =
                lookupFeatureTypeInSchema<ScalarType>(JSON_SELECTION, 'ScalarType', schema, feature);
            return [
              {
                name: 'message',
                type: jsonSelectionType
              },
              {
                name: 'extensions',
                type: jsonSelectionType
              },
            ]
          }
        })
    );

    /*
      input HTTPHeaderMapping {
        name: String!
        from: String
        value: String
      }
    */
    this.registerType(
        createInputObjectTypeSpecification({
          name: HTTP_HEADER_MAPPING,
          inputFieldsFct: (schema) => [
            {
              name: 'name',
              type: new NonNullType(schema.stringType())
            },
            {
              name: 'from',
              type: schema.stringType()
            },
            {
              name: 'value',
              type: schema.stringType()
            },
          ]
        })
    );

    /*
      input ConnectBatch {
        maxSize: Int
      }
     */
    this.registerType(
        createInputObjectTypeSpecification({
          name: CONNECT_BATCH,
          inputFieldsFct: (schema) => [
            {
              name: 'maxSize',
              type: schema.intType()
            }
          ]
        })
    )

    /*
      input SourceHTTP {
        baseURL: String!
        headers: [HTTPHeaderMapping!]

        # added in v0.2
        path: JSONSelection
        query: JSONSelection
      }
    */
    this.registerType(
        createInputObjectTypeSpecification({
          name: SOURCE_HTTP,
          inputFieldsFct: (schema, feature) => {
            const jsonSelectionType =
                lookupFeatureTypeInSchema<ScalarType>(JSON_SELECTION, 'ScalarType', schema, feature);
            const httpHeaderMappingType =
                lookupFeatureTypeInSchema<InputObjectType>(HTTP_HEADER_MAPPING, 'InputObjectType', schema, feature);
            return [
              {
                name: 'baseURL',
                type: schema.stringType()
              },
              {
                name: 'headers',
                type: new ListType(new NonNullType(httpHeaderMappingType))
              },
              {
                name: 'path',
                type: jsonSelectionType
              },
              {
                name: 'queryParams',
                type: jsonSelectionType
              }
            ];
          }
        })
    );

    /*
      input ConnectHTTP {
        GET: URLPathTemplate
        POST: URLPathTemplate
        PUT: URLPathTemplate
        PATCH: URLPathTemplate
        DELETE: URLPathTemplate
        body: JSONSelection
        headers: [HTTPHeaderMapping!]

        # added in v0.2
        path: JSONSelection
        query: JSONSelection
      }
    */
    this.registerType(
      createInputObjectTypeSpecification({
        name: CONNECT_HTTP,
        inputFieldsFct: (schema, feature) => {
          const urlPathTemplateType =
              lookupFeatureTypeInSchema<ScalarType>(URL_PATH_TEMPLATE, 'ScalarType', schema, feature);
          const jsonSelectionType =
              lookupFeatureTypeInSchema<ScalarType>(JSON_SELECTION, 'ScalarType', schema, feature);
          const httpHeaderMappingType =
              lookupFeatureTypeInSchema<InputObjectType>(HTTP_HEADER_MAPPING, 'InputObjectType', schema, feature);
          return [
            {
              name: 'GET',
              type: urlPathTemplateType
            },
            {
              name: 'POST',
              type: urlPathTemplateType
            },
            {
              name: 'PUT',
              type: urlPathTemplateType
            },
            {
              name: 'PATCH',
              type: urlPathTemplateType
            },
            {
              name: 'DELETE',
              type: urlPathTemplateType
            },
            {
              name: 'body',
              type: jsonSelectionType
            },
            {
              name: 'headers',
              type: new ListType(new NonNullType(httpHeaderMappingType))
            },
            {
              name: 'path',
              type: jsonSelectionType
            },
            {
              name: 'queryParams',
              type: jsonSelectionType
            },
          ];
        }
      })
    );

    /*
      directive @connect(
        source: String
        http: ConnectHTTP!
        batch: ConnectBatch
        selection: JSONSelection!
        entity: Boolean = false
        errors: ConnectorErrors
      ) repeatable on FIELD_DEFINITION
        | OBJECT # added in v0.2, validation enforced in rust
    */
    this.registerDirective(
      createDirectiveSpecification({
        name: CONNECT,
        locations: [DirectiveLocation.FIELD_DEFINITION, DirectiveLocation.OBJECT],
        repeatable: true,
        args: [
          {
            name: 'source',
            type: (schema) => schema.stringType()
          },
          {
            name: 'http',
            type: (schema, feature) => {
              const connectHttpType =
                  lookupFeatureTypeInSchema<InputObjectType>(CONNECT_HTTP, 'InputObjectType', schema, feature);
              return new NonNullType(connectHttpType);
            }
          },
          {
            name: 'batch',
            type: (schema, feature) =>
                lookupFeatureTypeInSchema<InputObjectType>(CONNECT_BATCH, 'InputObjectType', schema, feature)
          },
          {
            name: 'selection',
            type: (schema, feature) =>
                lookupFeatureTypeInSchema<ScalarType>(JSON_SELECTION, 'ScalarType', schema, feature)
          },
          {
            name: 'entity',
            type: (schema) => schema.booleanType(),
            defaultValue: false
          },
          {
            name: 'errors',
            type: (schema, feature) =>
                lookupFeatureTypeInSchema<InputObjectType>(CONNECTOR_ERRORS, 'InputObjectType', schema, feature)
          }
        ],
        // We "compose" these directives using the  `@join__directive` mechanism,
        // so they do not need to be composed in the way passing `composes: true`
        // here implies.
        composes: false,
      }),
    );

    /*
      directive @source(
        name: String!
        http: SourceHttp!
        errors: ConnectorErrors
      ) repeatable on SCHEMA
    */
    this.registerDirective(
      createDirectiveSpecification({
        name: SOURCE,
        locations: [DirectiveLocation.SCHEMA],
        repeatable: true,
        composes: false,
        args: [
          {
            name: 'name',
            type: (schema) => new NonNullType(schema.stringType())
          },
          {
            name: 'http',
            type: (schema, feature) => {
              const sourceHttpType =
                  lookupFeatureTypeInSchema<InputObjectType>(SOURCE_HTTP, 'InputObjectType', schema, feature);
              return new NonNullType(sourceHttpType);
            }
          },
          {
            name: 'errors',
            type: (schema, feature) =>
                lookupFeatureTypeInSchema<InputObjectType>(CONNECTOR_ERRORS, 'InputObjectType', schema, feature)
          }
        ]
      }),
    );
  }

  get defaultCorePurpose(): CorePurpose {
    return 'EXECUTION';
  }
}

export const CONNECT_VERSIONS = new FeatureDefinitions<ConnectSpecDefinition>(
  connectIdentity,
)
  .add(
    new ConnectSpecDefinition(
      new FeatureVersion(0, 1),
      new FeatureVersion(2, 10),
    ),
  )
  .add(
    new ConnectSpecDefinition(
      new FeatureVersion(0, 2),
      new FeatureVersion(2, 10),
    ),
  );

registerKnownFeature(CONNECT_VERSIONS);
