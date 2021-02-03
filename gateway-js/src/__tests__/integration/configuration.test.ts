import { Logger } from 'apollo-server-types';
import { ApolloGateway } from '../..';
import {
  mockSDLQuerySuccess,
  mockStorageSecretSuccess,
  mockCompositionConfigLinkSuccess,
  mockCompositionConfigsSuccess,
  mockImplementingServicesSuccess,
  mockRawPartialSchemaSuccess,
  apiKeyHash,
  graphId,
} from './nockMocks';
import { getTestingCsdl } from '../execution-utils';
import { MockService } from './networkRequests.test';
import { parse } from 'graphql';

let logger: Logger;

const service: MockService = {
  gcsDefinitionPath: 'service-definition.json',
  partialSchemaPath: 'accounts-partial-schema.json',
  url: 'http://localhost:4001',
  sdl: `#graphql
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
  it('warns when both csdl and studio configuration are provided', async () => {
    gateway = new ApolloGateway({
      csdl: getTestingCsdl(),
      logger,
    });

    await gateway.load({
      apollo: { keyHash: apiKeyHash, graphId, graphVariant: 'current' },
    });

    expect(logger.warn).toHaveBeenCalledWith(
      'A local gateway configuration is overriding a managed federation configuration.' +
        '  To use the managed configuration, do not specify a service list or csdl locally.',
    );
  });

  it('conflicting configurations are warned about when present', async () => {
    mockSDLQuerySuccess(service);

    gateway = new ApolloGateway({
      serviceList: [{ name: 'accounts', url: service.url }],
      logger,
    });

    await gateway.load({
      apollo: { keyHash: apiKeyHash, graphId, graphVariant: 'current' },
    });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(
        /A local gateway configuration is overriding a managed federation configuration/,
      ),
    );
  });

  it('conflicting configurations are not warned about when absent', async () => {
    mockStorageSecretSuccess();
    mockCompositionConfigLinkSuccess();
    mockCompositionConfigsSuccess([service]);
    mockImplementingServicesSuccess(service);
    mockRawPartialSchemaSuccess(service);

    gateway = new ApolloGateway({
      logger,
    });

    await gateway.load({
      apollo: { keyHash: apiKeyHash, graphId, graphVariant: 'current' },
    });

    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.stringMatching(
        /A local gateway configuration is overriding a managed federation configuration/,
      ),
    );
  });

  it('throws when no configuration is provided', async () => {
    const gateway = new ApolloGateway({
      logger,
    });

    expect(gateway.load()).rejects.toThrowErrorMatchingInlineSnapshot(
      `"When a manual configuration is not provided, gateway requires an Apollo configuration. See https://www.apollographql.com/docs/apollo-server/federation/managed-federation/ for more information. Manual configuration options include: \`serviceList\`, \`csdl\`, and \`experimental_updateServiceDefinitions\`."`,
    );
  });
});

describe('gateway startup errors', () => {
  it("throws when static config can't be composed", async () => {
    const uncomposableSdl = parse(`#graphql
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
    `);

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

    expect(err.message).toMatchInlineSnapshot(`
      "A valid schema couldn't be composed. The following composition errors were found:
      	[accounts] User -> A @key selects id, but User.id could not be found
      	[accounts] Account -> A @key selects id, but Account.id could not be found"
    `);
  });
});
