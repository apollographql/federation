import gql from 'graphql-tag';
import http from 'http';
import mockedEnv from 'mocked-env';
import { Logger } from 'apollo-server-types';
import { ApolloGateway } from '../..';
import {
  mockSdlQuerySuccess,
  mockSupergraphSdlRequestSuccess,
  mockApolloConfig,
  mockCloudConfigUrl1,
  mockCloudConfigUrl2,
  mockCloudConfigUrl3,
} from './nockMocks';
import { getTestingSupergraphSdl } from '../execution-utils';
import { fixtures, Fixture } from 'apollo-federation-integration-testsuite';

let logger: Logger;

const service: Fixture = {
  name: 'accounts',
  url: 'http://localhost:4001',
  typeDefs: gql`
    extend type Query {
      me: User
      everyone: [User]
    }

    "This is my User"
    type User @key(fields: "id") {
      id: ID!
      name: String
      username: String
    }
  `,
};

beforeEach(() => {
  const warn = jest.fn();
  const debug = jest.fn();
  const error = jest.fn();
  const info = jest.fn();

  logger = {
    warn,
    debug,
    error,
    info,
  };
});

describe('gateway configuration warnings', () => {
  let gateway: ApolloGateway | null = null;
  afterEach(async () => {
    if (gateway) {
      await gateway.stop();
      gateway = null;
    }
  });
  it('warns when both supergraphSdl and studio configuration are provided', async () => {
    gateway = new ApolloGateway({
      supergraphSdl: getTestingSupergraphSdl(),
      logger,
    });

    await gateway.load(mockApolloConfig);

    expect(logger.warn).toHaveBeenCalledWith(
      'A local gateway configuration is overriding a managed federation configuration.' +
        '  To use the managed configuration, do not specify a service list or supergraphSdl locally.',
    );
  });

  it('warns when both manual update configurations are provided', async () => {
    gateway = new ApolloGateway({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      experimental_updateSupergraphSdl: async () => undefined,
      experimental_updateServiceDefinitions: async () => undefined,
      logger,
    });

    expect(logger.warn).toHaveBeenCalledWith(
      'Gateway found two manual update configurations when only one should be ' +
        'provided. Gateway will default to using the provided `experimental_updateSupergraphSdl` ' +
        'function when both `experimental_updateSupergraphSdl` and experimental_updateServiceDefinitions` ' +
        'are provided.',
    );

    // Set to `null` so we don't try to call `stop` on it in the `afterEach`,
    // which triggers a different error that we're not testing for here.
    gateway = null;
  });

  it('conflicting configurations are warned about when present', async () => {
    mockSdlQuerySuccess(service);

    gateway = new ApolloGateway({
      serviceList: [{ name: 'accounts', url: service.url }],
      logger,
    });

    await gateway.load(mockApolloConfig);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(
        /A local gateway configuration is overriding a managed federation configuration/,
      ),
    );
  });

  it('conflicting configurations are not warned about when absent', async () => {
    mockSupergraphSdlRequestSuccess();

    gateway = new ApolloGateway({
      logger,
      uplinkEndpoints: [mockCloudConfigUrl1],
    });

    await gateway.load(mockApolloConfig);

    await gateway.stop();

    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.stringMatching(
        /A local gateway configuration is overriding a managed federation configuration/,
      ),
    );
  });

  it('deprecated conflicting configurations are not warned about when absent', async () => {
    mockSupergraphSdlRequestSuccess();

    gateway = new ApolloGateway({
      logger,
      schemaConfigDeliveryEndpoint: mockCloudConfigUrl1,
    });

    await gateway.load(mockApolloConfig);

    await gateway.stop();

    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.stringMatching(
        /A local gateway configuration is overriding a managed federation configuration/,
      ),
    );
  });

  it('throws when no configuration is provided', async () => {
    gateway = new ApolloGateway({
      logger,
    });

    expect(gateway.load()).rejects.toThrowErrorMatchingInlineSnapshot(
      `"When a manual configuration is not provided, gateway requires an Apollo configuration. See https://www.apollographql.com/docs/apollo-server/federation/managed-federation/ for more information. Manual configuration options include: \`serviceList\`, \`supergraphSdl\`, and \`experimental_updateServiceDefinitions\`."`,
    );

    // Set to `null` so we don't try to call `stop` on it in the `afterEach`,
    // which triggers a different error that we're not testing for here.
    gateway = null;
  });
});

describe('gateway startup errors', () => {
  it("throws when static config can't be composed", async () => {
    const uncomposableSdl = gql`
      type Query {
        me: User
        everyone: [User]
        account(id: String): Account
      }

      type User @key(fields: "id") {
        name: String
        username: String
      }

      type Account @key(fields: "id") {
        name: String
        username: String
      }
    `;

    const gateway = new ApolloGateway({
      localServiceList: [
        { name: 'accounts', url: service.url, typeDefs: uncomposableSdl },
      ],
      logger,
    });

    // This is the ideal, but our version of Jest has a bug with printing error snapshots.
    // See: https://github.com/facebook/jest/pull/10217 (fixed in v26.2.0)
    //     expect(gateway.load()).rejects.toThrowErrorMatchingInlineSnapshot(`
    //       "A valid schema couldn't be composed. The following composition errors were found:
    //         [accounts] User -> A @key selects id, but User.id could not be found
    //         [accounts] Account -> A @key selects id, but Account.id could not be found"
    //     `);
    // Instead we'll just use the regular snapshot matcher...
    let err: any;
    try {
      await gateway.load();
    } catch (e) {
      err = e;
    }

    const expected =
      "A valid schema couldn't be composed. The following composition errors were found:\n"
    + '	[accounts] On type "User", for @key(fields: "id"): Cannot query field "id" on type "User" (the field should be either be added to this subgraph or, if it should not be resolved by this subgraph, you need to add it to this subgraph with @external).\n'
    + '	[accounts] On type "Account", for @key(fields: "id"): Cannot query field "id" on type "Account" (the field should be either be added to this subgraph or, if it should not be resolved by this subgraph, you need to add it to this subgraph with @external).'
    expect(err.message).toBe(expected);
  });
});

describe('gateway config / env behavior', () => {
  let gateway: ApolloGateway | null = null;
  let cleanUp: (() => void) | null = null;
  afterEach(async () => {
    if (gateway) {
      await gateway.stop();
      gateway = null;
    }

    if (cleanUp) {
      cleanUp();
      cleanUp = null;
    }
  });

  describe('introspection headers', () => {
    it('should allow not passing introspectionHeaders', async () => {
      const receivedHeaders = jest.fn();
      const nock = mockSdlQuerySuccess(service);
      nock.on('request', (req: http.ClientRequest) =>
        receivedHeaders(req.getHeaders()),
      );

      gateway = new ApolloGateway({
        serviceList: [{ name: 'accounts', url: service.url }],
      });

      await gateway.load(mockApolloConfig);

      expect(receivedHeaders).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost:4001',
        }),
      );
    });

    it('should use static headers', async () => {
      const receivedHeaders = jest.fn();
      const nock = mockSdlQuerySuccess(service);
      nock.on('request', (req: http.ClientRequest) =>
        receivedHeaders(req.getHeaders()),
      );

      gateway = new ApolloGateway({
        serviceList: [{ name: 'accounts', url: service.url }],
        introspectionHeaders: {
          Authorization: 'Bearer static',
        },
      });

      await gateway.load(mockApolloConfig);

      expect(receivedHeaders).toHaveBeenCalledWith(
        expect.objectContaining({
          authorization: ['Bearer static'],
        }),
      );
    });

    it('should use dynamic async headers', async () => {
      const receivedHeaders = jest.fn();
      const nock = mockSdlQuerySuccess(service);
      nock.on('request', (req: http.ClientRequest) =>
        receivedHeaders(req.getHeaders()),
      );

      gateway = new ApolloGateway({
        serviceList: [{ name: 'accounts', url: service.url }],
        introspectionHeaders: async ({ name }) => ({
          Authorization: 'Bearer dynamic-async',
          'X-Service-Name': name,
        }),
      });

      await gateway.load(mockApolloConfig);

      expect(receivedHeaders).toHaveBeenCalledWith(
        expect.objectContaining({
          authorization: ['Bearer dynamic-async'],
          'x-service-name': ['accounts'],
        }),
      );
    });

    it('should use dynamic non-async headers', async () => {
      const receivedHeaders = jest.fn();
      const nock = mockSdlQuerySuccess(service);
      nock.on('request', (req: http.ClientRequest) =>
        receivedHeaders(req.getHeaders()),
      );

      gateway = new ApolloGateway({
        serviceList: [{ name: 'accounts', url: service.url }],
        introspectionHeaders: ({ name }) => ({
          Authorization: 'Bearer dynamic-sync',
          'X-Service-Name': name,
        }),
      });

      await gateway.load(mockApolloConfig);

      expect(receivedHeaders).toHaveBeenCalledWith(
        expect.objectContaining({
          authorization: ['Bearer dynamic-sync'],
          'x-service-name': ['accounts'],
        }),
      );
    });
  });

  describe('schema config delivery endpoint configuration', () => {
    it('A code config overrides the env variable', async () => {
      cleanUp = mockedEnv({
        APOLLO_SCHEMA_CONFIG_DELIVERY_ENDPOINT: 'env-config',
      });

      const config = {
        logger,
        uplinkEndpoints: [mockCloudConfigUrl1, mockCloudConfigUrl2, mockCloudConfigUrl3],
      };
      gateway = new ApolloGateway(config);

      expect(gateway['getUplinkEndpoints'](config)).toEqual([
        mockCloudConfigUrl1,
        mockCloudConfigUrl2,
        mockCloudConfigUrl3,
      ]);

      gateway = null;
    });
  });

  describe('deprecated schema config delivery endpoint configuration', () => {
    it('A code config overrides the env variable', async () => {
      cleanUp = mockedEnv({
        APOLLO_SCHEMA_CONFIG_DELIVERY_ENDPOINT: 'env-config',
      });

      const config = {
        logger,
        schemaConfigDeliveryEndpoint: 'code-config',
      };
      gateway = new ApolloGateway(config);

      expect(gateway['getUplinkEndpoints'](config)).toEqual(['code-config']);

      gateway = null;
    });
  });
});

describe('deprecation warnings', () => {
  it('warns with `experimental_updateSupergraphSdl` option set', async () => {
    const gateway = new ApolloGateway({
      async experimental_updateSupergraphSdl() {
        return {
          id: 'supergraph',
          supergraphSdl: getTestingSupergraphSdl(),
        };
      },
      logger,
    });

    await gateway.load();

    expect(logger.warn).toHaveBeenCalledWith(
      'The `experimental_updateSupergraphSdl` option is deprecated and will be removed in a future version of `@apollo/gateway`. Please migrate to the function form of the `supergraphSdl` configuration option.',
    );

    await gateway.stop();
  });

  it('warns with `experimental_updateServiceDefinitions` option set', async () => {
    const gateway = new ApolloGateway({
      async experimental_updateServiceDefinitions() {
        return {
          isNewSchema: false,
        };
      },
      logger,
    });

    try {
      await gateway.load();
    // gateway will throw since we're not providing an actual service list, disregard
    } catch {}

    expect(logger.warn).toHaveBeenCalledWith(
      'The `experimental_updateServiceDefinitions` option is deprecated and will be removed in a future version of `@apollo/gateway`. Please migrate to the function form of the `supergraphSdl` configuration option.',
    );
  });

  it('warns with `serviceList` option set', async () => {
    const gateway = new ApolloGateway({
      serviceList: [{ name: 'accounts', url: 'http://localhost:4001' }],
      logger,
    });

    try {
      await gateway.load();
      // gateway will throw since we haven't mocked these requests, unimportant for this test
    } catch {}

    expect(logger.warn).toHaveBeenCalledWith(
      'The `serviceList` option is deprecated and will be removed in a future version of `@apollo/gateway`. Please migrate to its replacement `IntrospectAndCompose`. More information on `IntrospectAndCompose` can be found in the documentation.',
    );
  });

  it('warns with `localServiceList` option set', async () => {
    const gateway = new ApolloGateway({
      localServiceList: fixtures,
      logger,
    });

    await gateway.load();

    expect(logger.warn).toHaveBeenCalledWith(
      'The `localServiceList` option is deprecated and will be removed in a future version of `@apollo/gateway`. Please migrate to the `LocalCompose` supergraph manager exported by `@apollo/gateway`.',
    );

    await gateway.stop();
  });

  it('warns with `schemaConfigDeliveryEndpoint` option set', async () => {
    new ApolloGateway({
      schemaConfigDeliveryEndpoint: 'test',
      logger,
    });

    expect(logger.warn).toHaveBeenCalledWith(
      'The `schemaConfigDeliveryEndpoint` option is deprecated and will be removed in a future version of `@apollo/gateway`. Please migrate to the equivalent (array form) `uplinkEndpoints` configuration option.',
    );
  });
});
