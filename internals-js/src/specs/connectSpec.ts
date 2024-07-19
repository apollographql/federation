import {DirectiveLocation, GraphQLError} from 'graphql';
import { CorePurpose, FeatureDefinition, FeatureDefinitions, FeatureUrl, FeatureVersion } from "./coreSpec";
import {
  Schema,
  NonNullType,
  InputObjectType,
  InputFieldDefinition,
  ListType,
} from '../definitions';
import { registerKnownFeature } from '../knownCoreFeatures';
import { createDirectiveSpecification } from '../directiveAndTypeSpecification';

export const connectIdentity = 'https://specs.apollo.dev/connect';

const CONNECT = "connect";
const SOURCE = "source";
const URL_PATH_TEMPLATE = "URLPathTemplate";
const JSON_SELECTION = "JSONSelection";
const CONNECT_HTTP = "ConnectHTTP";
const SOURCE_HTTP = "SourceHTTP";
const HTTP_HEADER_MAPPING = "HTTPHeaderMapping";

export class ConnectSpecDefinition extends FeatureDefinition {
  constructor(version: FeatureVersion, readonly minimumFederationVersion: FeatureVersion) {
    super(new FeatureUrl(connectIdentity, CONNECT, version), minimumFederationVersion);

    this.registerDirective(createDirectiveSpecification({
      name: CONNECT,
      locations: [DirectiveLocation.FIELD_DEFINITION],
      repeatable: true,
      // We "compose" these directives using the  `@join__directive` mechanism,
      // so they do not need to be composed in the way passing `composes: true`
      // here implies.
      composes: false,
    }));

    this.registerDirective(createDirectiveSpecification({
      name: SOURCE,
      locations: [DirectiveLocation.SCHEMA],
      repeatable: true,
      composes: false,
    }));

    this.registerType({ name: URL_PATH_TEMPLATE, checkOrAdd: () => [] });
    this.registerType({ name: JSON_SELECTION, checkOrAdd: () => [] });
    this.registerType({ name: CONNECT_HTTP, checkOrAdd: () => [] });
    this.registerType({ name: SOURCE_HTTP, checkOrAdd: () => [] });
    this.registerType({ name: HTTP_HEADER_MAPPING, checkOrAdd: () => [] });
  }

  addElementsToSchema(schema: Schema): GraphQLError[] {
    /* scalar URLPathTemplate */
    const URLPathTemplate = this.addScalarType(schema, URL_PATH_TEMPLATE);

    /* scalar JSONSelection */
    const JSONSelection = this.addScalarType(schema, JSON_SELECTION);

    /*
      directive @connect(
        source: String
        http: ConnectHTTP
        selection: JSONSelection!
        entity: Boolean = false
      ) repeatable on FIELD_DEFINITION
    */
    const connect = this.addDirective(schema, CONNECT).addLocations(DirectiveLocation.FIELD_DEFINITION);
    connect.repeatable = true;

    connect.addArgument(SOURCE, schema.stringType());

    /*
      input HTTPHeaderMapping {
        name: String!
        from: String
        value: String
      }
    */
    const HTTPHeaderMapping = schema.addType(new InputObjectType(this.typeNameInSchema(schema, HTTP_HEADER_MAPPING)!));
    HTTPHeaderMapping.addField(new InputFieldDefinition('name')).type =
      new NonNullType(schema.stringType());
    HTTPHeaderMapping.addField(new InputFieldDefinition('from')).type =
      schema.stringType();
    HTTPHeaderMapping.addField(new InputFieldDefinition('value')).type =
      schema.stringType();

    /*
      input ConnectHTTP {
        GET: URLPathTemplate
        POST: URLPathTemplate
        PUT: URLPathTemplate
        PATCH: URLPathTemplate
        DELETE: URLPathTemplate
        body: JSONSelection
        headers: [HTTPHeaderMapping!]
      }
    */
    const ConnectHTTP = schema.addType(new InputObjectType(this.typeNameInSchema(schema, CONNECT_HTTP)!));
    ConnectHTTP.addField(new InputFieldDefinition('GET')).type = URLPathTemplate;
    ConnectHTTP.addField(new InputFieldDefinition('POST')).type = URLPathTemplate;
    ConnectHTTP.addField(new InputFieldDefinition('PUT')).type = URLPathTemplate;
    ConnectHTTP.addField(new InputFieldDefinition('PATCH')).type = URLPathTemplate;
    ConnectHTTP.addField(new InputFieldDefinition('DELETE')).type = URLPathTemplate;
    ConnectHTTP.addField(new InputFieldDefinition('body')).type = JSONSelection;
    ConnectHTTP.addField(new InputFieldDefinition('headers')).type =
      new ListType(new NonNullType(HTTPHeaderMapping));
    connect.addArgument('http', new NonNullType(ConnectHTTP));

    connect.addArgument('selection', new NonNullType(JSONSelection));
    connect.addArgument('entity', schema.booleanType(), false);

    /*
      directive @source(
        name: String!
        http: ConnectHTTP
      ) repeatable on SCHEMA
    */
    const source = this.addDirective(schema, SOURCE).addLocations(
      DirectiveLocation.SCHEMA,
    );
    source.repeatable = true;
    source.addArgument('name', new NonNullType(schema.stringType()));

    /*
      input SourceHTTP {
        baseURL: String!
        headers: [HTTPHeaderMapping!]
      }
    */
    const SourceHTTP = schema.addType(new InputObjectType(this.typeNameInSchema(schema, SOURCE_HTTP)!));
    SourceHTTP.addField(new InputFieldDefinition('baseURL')).type =
      new NonNullType(schema.stringType());
    SourceHTTP.addField(new InputFieldDefinition('headers')).type =
      new ListType(new NonNullType(HTTPHeaderMapping));

    source.addArgument('http', new NonNullType(SourceHTTP));

    return [];
  }

  get defaultCorePurpose(): CorePurpose {
    return 'EXECUTION';
  }
}

export type SourceDirectiveArgs = {
  name: string;
  http: SourceDirectiveHTTP;
};

export type SourceDirectiveHTTP = {
  baseURL: string;
  headers?: HTTPHeaderMapping[];
};

type HTTPHeaderMapping = {
  name: string;
  as?: string;
  value?: string;
};

type URLPathTemplate = string;
type JSONSelection = string;

export type ConnectDirectiveArgs = {
  source: string;
  http: ConnectDirectiveHTTP;
  selection?: JSONSelection;
};

export type ConnectDirectiveHTTP = {
  GET?: URLPathTemplate;
  POST?: URLPathTemplate;
  PUT?: URLPathTemplate;
  PATCH?: URLPathTemplate;
  DELETE?: URLPathTemplate;
  body?: JSONSelection;
  headers?: HTTPHeaderMapping[];
};

export const CONNECT_VERSIONS = new FeatureDefinitions<ConnectSpecDefinition>(connectIdentity)
  .add(new ConnectSpecDefinition(new FeatureVersion(0, 1), new FeatureVersion(2, 9)));

registerKnownFeature(CONNECT_VERSIONS);
