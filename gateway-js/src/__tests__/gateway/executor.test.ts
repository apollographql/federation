import gql from 'graphql-tag';
import { ApolloGateway } from '../../';
import { ApolloServer } from "apollo-server";
import { fixtures } from 'apollo-federation-integration-testsuite';
import { Logger } from 'apollo-server-types';
import { fetch } from '__mocks__/apollo-server-env';

let logger: Logger;

beforeEach(() => {
  fetch.mockReset();
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

describe('ApolloGateway executor', () => {
  it('validates requests prior to execution', async () => {
    const gateway = new ApolloGateway({
      localServiceList: fixtures,
    });

    const { executor } = await gateway.load();

    const source = `#graphql
      query InvalidVariables($first: Int!) {
        topReviews(first: $first) {
          body
        }
      }
    `;

    const { errors } = await executor({
      source,
      document: gql(source),
      request: {
        variables: { first: '3' },
      },
      queryHash: 'hashed',
      context: null,
      cache: {} as any,
      logger,
    });

    expect(errors![0].message).toMatch(
      'Variable "$first" got invalid value "3";',
    );
  });

  it('should not crash if no variables are not provided', async () => {
    const me = { id: '1', birthDate: '1988-10-21'};
    fetch.mockJSONResponseOnce({ data: { me } });
    const gateway = new ApolloGateway({
      localServiceList: fixtures,
    });

    const { executor } = await gateway.load();

    const source = `#graphql
      query Me($locale: String) {
        me {
          id
          birthDate(locale: $locale)
        }
      }
    `;

    const { errors, data } = await executor({
      source,
      document: gql(source),
      request: {
      },
      queryHash: 'hashed',
      context: null,
      cache: {} as any,
      logger,
    });

    expect(errors).toBeFalsy();
    expect(data).toEqual({ me });
  });

  it('still sets the ApolloServer executor on load rejection', async () => {
    const gateway = new ApolloGateway({
      // Empty service list will trigger the gateway to crash on load, which is what we want.
      serviceList: [],
      logger,
    });

    // Mock implementation of process.exit with another () => never function.
    // This is because the gateway doesn't just throw in this scenario, it crashes.
    const mockExit = jest
      .spyOn(process, 'exit')
      .mockImplementation((code) => {
        throw new Error(code?.toString());
      });

    const server = new ApolloServer({
      gateway,
      subscriptions: false,
      logger,
    });

    // Ensure the throw happens to maintain the correctness of this test.
    await expect(
      server.executeOperation({ query: '{ __typename }' })).rejects.toThrow();

    expect(server.requestOptions.executor).toBe(gateway.executor);

    expect(logger.error.mock.calls).toEqual([
      ["Error checking for changes to service definitions: Tried to load services from remote endpoints but none provided"],
      ["This data graph is missing a valid configuration. Tried to load services from remote endpoints but none provided"]
    ]);

    mockExit.mockRestore();
  });
});
