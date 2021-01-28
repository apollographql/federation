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
  it('warns when both csdl and studio configuration are provided', async () => {
    const gateway = new ApolloGateway({
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

    const gateway = new ApolloGateway({
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

    const gateway = new ApolloGateway({
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

    expect(gateway.load()).rejects.toThrowError(
      "A valid schema couldn't be composed",
    );
  });
});
