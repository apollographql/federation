import gql from 'graphql-tag';
import { ApolloGateway } from '../../';
import { ApolloServer } from "apollo-server";
import { fixtures } from 'apollo-federation-integration-testsuite';
import { Logger } from 'apollo-server-types';
import { fetch } from '../../__mocks__/apollo-server-env';

let logger: {
  warn: jest.MockedFunction<Logger['warn']>,
  debug: jest.MockedFunction<Logger['debug']>,
  error: jest.MockedFunction<Logger['error']>,
  info: jest.MockedFunction<Logger['info']>,
}

beforeEach(() => {
  fetch.mockReset();

  logger = {
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
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

     // @ts-ignore
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

     // @ts-ignore
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

    const server = new ApolloServer({
      gateway,
      subscriptions: false,
      logger,
    });

    // Ensure the throw happens to maintain the correctness of this test.
    await expect(
      server.executeOperation({ query: '{ __typename }' }),
    ).rejects.toThrow(
      'This data graph is missing a valid configuration. More details may be available in the server logs.',
    );

    // Note: the original point of this test was to ensure that this field is
    // set correctly even on schema load error, just in case the schema gets
    // loaded properly later. But ApolloGateway has never managed to recover
    // from a failure to load the schema, and Apollo Server v2.22 explicitly
    // considers a server that failed to load the schema to have failed to start
    // and there's no way to start it. So maybe this test doesn't matter any
    // more. That said, perhaps it's nice to test the error handling.
    expect(server.requestOptions.executor).toBe(gateway.executor);

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringMatching(
        /Apollo Server was started implicitly.*Tried to load services from remote endpoints but none provided/,
      ),
    );
  });
});
