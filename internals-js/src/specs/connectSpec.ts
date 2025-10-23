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
  isInputObjectType,
  isNonNullType,
  ListType,
  NamedType,
  NonNullType,
  ScalarType,
  Schema,
} from '../definitions';
import { registerKnownFeature } from '../knownCoreFeatures';
import {
  createDirectiveSpecification,
  createScalarTypeSpecification,
  ensureSameTypeKind,
  InputFieldSpecification,
  TypeSpecification,
} from '../directiveAndTypeSpecification';
import { ERRORS } from '../error';
import { sameType } from '../types';
import { assert } from '../utils';
import { valueEquals, valueToString } from '../values';

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
        queryParams: JSONSelection
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
                type: new NonNullType(schema.stringType())
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
        queryParams: JSONSelection
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
        id: String
        http: ConnectHTTP!
        batch: ConnectBatch
        errors: ConnectorErrors
        selection: JSONSelection!
        entity: Boolean = false
        isSuccess: JSONSelection
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
            name: 'id',
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
            name: 'errors',
            type: (schema, feature) =>
                lookupFeatureTypeInSchema<InputObjectType>(CONNECTOR_ERRORS, 'InputObjectType', schema, feature)
          },
          {
            name: 'selection',
            type: (schema, feature) => {
              const jsonSelectionType =
                  lookupFeatureTypeInSchema<ScalarType>(JSON_SELECTION, 'ScalarType', schema, feature);
              return new NonNullType(jsonSelectionType);
            }
          },
          {
            name: 'entity',
            type: (schema) => schema.booleanType(),
            defaultValue: false
          },
          {
            name: 'isSuccess',
            type: (schema, feature) =>
                lookupFeatureTypeInSchema<ScalarType>(JSON_SELECTION, 'ScalarType', schema, feature)
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
        http: SourceHTTP!
        errors: ConnectorErrors
        isSuccess: JSONSelection
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
          },
          {
            name: 'isSuccess',
            type: (schema, feature) =>
                lookupFeatureTypeInSchema<ScalarType>(JSON_SELECTION, 'ScalarType', schema, feature)
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
  )
  .add(
    new ConnectSpecDefinition(
      new FeatureVersion(0, 3),
      new FeatureVersion(2, 12),
    ),
  );

registerKnownFeature(CONNECT_VERSIONS);

// This function is purposefully declared only in this file and without export.
//
// Do NOT add this to "internals-js/src/directiveAndTypeSpecification.ts", and
// do NOT export this function.
//
// Subgraph schema building, at this time of writing, does not really support
// input objects in specs. We did a number of one-off things to support them in
// the connect spec's case, and it will be non-maintainable/bug-prone to do them
// again.
// 
// There's work to be done to support input objects more generally; please see
// https://github.com/apollographql/federation/pull/3311 for more information. 
function createInputObjectTypeSpecification({
  name,
  inputFieldsFct,
}: {
  name: string,
  inputFieldsFct: (schema: Schema, feature?: CoreFeature) => InputFieldSpecification[],
}): TypeSpecification {
  return {
    name,
    checkOrAdd: (schema: Schema, feature?: CoreFeature, asBuiltIn?: boolean) => {
      const actualName = feature?.typeNameInSchema(name) ?? name;
      const expectedFields = inputFieldsFct(schema, feature);
      const existing = schema.type(actualName);
      if (existing) {
        let errors = ensureSameTypeKind('InputObjectType', existing);
        if (errors.length > 0) {
          return errors;
        }
        assert(isInputObjectType(existing), 'Should be an input object type');
        // The following mimics `ensureSameArguments()`, but with some changes.
        for (const { name: fieldName, type, defaultValue } of expectedFields) {
          const existingField = existing.field(fieldName);
          if (!existingField) {
            // Not declaring an optional input field is ok: that means you won't
            // be able to pass a non-default value in your schema, but we allow
            // you that. But missing a required input field it not ok.
            if (isNonNullType(type) && defaultValue === undefined) {
              errors.push(ERRORS.TYPE_DEFINITION_INVALID.err(
                `Invalid definition for type ${name}: missing required input field "${fieldName}"`,
                { nodes: existing.sourceAST },
              ));
            }
            continue;
          }

          let existingType = existingField.type!;
          if (isNonNullType(existingType) && !isNonNullType(type)) {
            // It's ok to redefine an optional input field as mandatory. For
            // instance, if you want to force people on your team to provide a
            // "maxSize", you can redefine ConnectBatch as
            // `input ConnectBatch { maxSize: Int! }` to get validation. In
            // other words, you are allowed to always pass an input field that
            // is optional if you so wish.
            existingType = existingType.ofType;
          }
          // Note that while `ensureSameArguments()` allows input type
          // redefinitions (e.g. allowing users to declare `String` instead of a
          // custom scalar), this behavior can be confusing/error-prone more
          // generally, so we forbid this for now. We can relax this later on a
          // case-by-case basis if needed.
          //
          // Further, `ensureSameArguments()` would skip default value checking
          // if the input type was non-nullable. It's unclear why this is there;
          // it may have been a mistake due to the impression that non-nullable
          // inputs can't have default values (they can), or this may have been
          // to avoid some breaking change, but there's no such limitation in
          // the case of input objects, so we always validate default values
          // here.
          if (!sameType(type, existingType)) {
            errors.push(ERRORS.TYPE_DEFINITION_INVALID.err(
              `Invalid definition for type ${name}: input field "${fieldName}" should have type "${type}" but found type "${existingField.type!}"`,
              { nodes: existingField.sourceAST },
            ));
          } else if (!valueEquals(defaultValue, existingField.defaultValue)) {
            errors.push(ERRORS.TYPE_DEFINITION_INVALID.err(
              `Invalid definition type ${name}: input field "${fieldName}" should have default value ${valueToString(defaultValue)} but found default value ${valueToString(existingField.defaultValue)}`,
              { nodes: existingField.sourceAST },
            ));
          }
        }
        for (const existingField of existing.fields()) {
          // If it's an expected input field, we already validated it. But we
          // still need to reject unknown input fields.
          if (!expectedFields.some((field) => field.name === existingField.name)) {
            errors.push(ERRORS.TYPE_DEFINITION_INVALID.err(
              `Invalid definition for type ${name}: unknown/unsupported input field "${existingField.name}"`,
              { nodes: existingField.sourceAST },
            ));
          }
        }
        return errors;
      } else {
        const createdType = schema.addType(new InputObjectType(actualName, asBuiltIn));
        for (const { name, type, defaultValue } of expectedFields) {
          const newField = createdType.addField(name, type);
          newField.defaultValue = defaultValue;
        }
        return [];
      }
    },
  }
}
