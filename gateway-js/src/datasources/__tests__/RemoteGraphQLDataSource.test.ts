import { fetch as customFetcher } from '../../__mocks__/apollo-server-env';
import { fetch } from '../../__mocks__/make-fetch-happen-fetcher';

import {
  ApolloError,
  AuthenticationError,
  ForbiddenError,
} from 'apollo-server-errors';

import { RemoteGraphQLDataSource } from '../RemoteGraphQLDataSource';
import { Headers } from 'apollo-server-env';
import { GraphQLRequestContext } from 'apollo-server-types';
import { GraphQLDataSourceRequestKind } from '../types';

beforeEach(() => {
  fetch.mockReset();
});

// Right now, none of these tests care what's on incomingRequestContext, so we
// pass this fake one in.
const defaultProcessOptions = {
  kind: GraphQLDataSourceRequestKind.INCOMING_OPERATION,
  incomingRequestContext: {} as any,
  context: {},
};

describe('constructing requests', () => {
  describe('without APQ', () => {
    it('stringifies a request with a query', async () => {
      const DataSource = new RemoteGraphQLDataSource({
        url: 'https://api.example.com/foo',
        apq: false,
      });

      fetch.mockJSONResponseOnce({ data: { me: 'james' } });

      const { data } = await DataSource.process({
        ...defaultProcessOptions,
        request: { query: '{ me { name } }' },
      });

      expect(data).toEqual({ me: 'james' });
      expect(fetch).toBeCalledTimes(1);
      expect(fetch).toHaveFetched('https://api.example.com/foo', {
        body: { query: '{ me { name } }' },
      });
    });

    it('passes variables', async () => {
      const DataSource = new RemoteGraphQLDataSource({
        url: 'https://api.example.com/foo',
        apq: false,
      });

      fetch.mockJSONResponseOnce({ data: { me: 'james' } });

      const { data } = await DataSource.process({
        ...defaultProcessOptions,
        request: {
          query: '{ me { name } }',
          variables: { id: '1' },
        },
      });

      expect(data).toEqual({ me: 'james' });
      expect(fetch).toBeCalledTimes(1);
      expect(fetch).toHaveFetched('https://api.example.com/foo', {
        body: { query: '{ me { name } }', variables: { id: '1' } },
      });
    });
  });

  describe('with APQ', () => {
    // When changing this, adjust the SHA-256 hash below as well.
    const query = '{ me { name } }';

    // This is a SHA-256 hash of `query` above.
    const sha256Hash =
      'b8d9506e34c83b0e53c2aa463624fcea354713bc38f95276e6f0bd893ffb5b88';

    describe('miss', () => {
      const apqNotFoundResponse = {
        errors: [
          {
            message: 'PersistedQueryNotFound',
            extensions: {
              code: 'PERSISTED_QUERY_NOT_FOUND',
              exception: {
                stacktrace: [
                  'PersistedQueryNotFoundError: PersistedQueryNotFound',
                ],
              },
            },
          },
        ],
      };

      it('stringifies a request with a query', async () => {
        const DataSource = new RemoteGraphQLDataSource({
          url: 'https://api.example.com/foo',
          apq: true,
        });

        fetch.mockJSONResponseOnce(apqNotFoundResponse);
        fetch.mockJSONResponseOnce({ data: { me: 'james' } });

        const { data } = await DataSource.process({
          ...defaultProcessOptions,
          request: { query },
        });

        expect(data).toEqual({ me: 'james' });
        expect(fetch).toBeCalledTimes(2);
        expect(fetch).toHaveFetchedNth(1, 'https://api.example.com/foo', {
          body: {
            extensions: {
              persistedQuery: {
                version: 1,
                sha256Hash,
              },
            },
          },
        });
        expect(fetch).toHaveFetchedNth(2, 'https://api.example.com/foo', {
          body: {
            query,
            extensions: {
              persistedQuery: {
                version: 1,
                sha256Hash,
              },
            },
          },
        });
      });

      it('passes variables', async () => {
        const DataSource = new RemoteGraphQLDataSource({
          url: 'https://api.example.com/foo',
          apq: true,
        });

        fetch.mockJSONResponseOnce(apqNotFoundResponse);
        fetch.mockJSONResponseOnce({ data: { me: 'james' } });

        const { data } = await DataSource.process({
          ...defaultProcessOptions,
          request: {
            query,
            variables: { id: '1' },
          },
        });

        expect(data).toEqual({ me: 'james' });
        expect(fetch).toBeCalledTimes(2);
        expect(fetch).toHaveFetchedNth(1, 'https://api.example.com/foo', {
          body: {
            variables: { id: '1' },
            extensions: {
              persistedQuery: {
                version: 1,
                sha256Hash,
              },
            },
          },
        });
        expect(fetch).toHaveFetchedNth(2, 'https://api.example.com/foo', {
          body: {
            query,
            variables: { id: '1' },
            extensions: {
              persistedQuery: {
                version: 1,
                sha256Hash,
              },
            },
          },
        });
      });
    });

    describe('hit', () => {
      it('stringifies a request with a query', async () => {
        const DataSource = new RemoteGraphQLDataSource({
          url: 'https://api.example.com/foo',
          apq: true,
        });

        fetch.mockJSONResponseOnce({ data: { me: 'james' } });

        const { data } = await DataSource.process({
          ...defaultProcessOptions,
          request: { query },
        });

        expect(data).toEqual({ me: 'james' });
        expect(fetch).toBeCalledTimes(1);
        expect(fetch).toHaveFetched('https://api.example.com/foo', {
          body: {
            extensions: {
              persistedQuery: {
                version: 1,
                sha256Hash,
              },
            },
          },
        });
      });

      it('passes variables', async () => {
        const DataSource = new RemoteGraphQLDataSource({
          url: 'https://api.example.com/foo',
          apq: true,
        });

        fetch.mockJSONResponseOnce({ data: { me: 'james' } });

        const { data } = await DataSource.process({
          ...defaultProcessOptions,
          request: {
            query,
            variables: { id: '1' },
          },
        });

        expect(data).toEqual({ me: 'james' });
        expect(fetch).toBeCalledTimes(1);
        expect(fetch).toHaveFetched('https://api.example.com/foo', {
          body: {
            variables: { id: '1' },
            extensions: {
              persistedQuery: {
                version: 1,
                sha256Hash,
              },
            },
          },
        });
      });
    });
  });
});

describe('fetcher', () => {
  it('uses a custom provided `fetcher`', async () => {
    const injectedFetch = fetch.mockJSONResponseOnce({
      data: { injected: true },
    });
    const DataSource = new RemoteGraphQLDataSource({
      url: 'https://api.example.com/foo',
      fetcher: injectedFetch,
    });

    const { data } = await DataSource.process({
      ...defaultProcessOptions,
      request: {
        query: '{ me { name } }',
        variables: { id: '1' },
      },
    });

    expect(injectedFetch).toHaveBeenCalled();
    expect(data).toEqual({ injected: true });
  });

  it('supports a custom fetcher, like `node-fetch`', async () => {
    const injectedFetch = customFetcher.mockJSONResponseOnce({
      data: { me: 'james' },
    });
    const DataSource = new RemoteGraphQLDataSource({
      url: 'https://api.example.com/foo',
      fetcher: injectedFetch,
    });

    const { data } = await DataSource.process({
      ...defaultProcessOptions,
      request: {
        query: '{ me { name } }',
        variables: { id: '1' },
      },
    });

    expect(injectedFetch).toHaveBeenCalled();
    expect(data).toEqual({ me: 'james' });
  });
});

describe('willSendRequest', () => {
  it('allows for modifying variables', async () => {
    const DataSource = new RemoteGraphQLDataSource({
      url: 'https://api.example.com/foo',
      willSendRequest: ({ request }) => {
        request.variables = { id: '2' };
      },
    });

    fetch.mockJSONResponseOnce({ data: { me: 'james' } });

    const { data } = await DataSource.process({
      ...defaultProcessOptions,
      request: {
        query: '{ me { name } }',
        variables: { id: '1' },
      },
    });

    expect(data).toEqual({ me: 'james' });
    expect(fetch).toHaveFetched('https://api.example.com/foo', {
      body: {
        query: '{ me { name } }',
        variables: { id: '2' },
      },
    });
  });

  it('accepts context', async () => {
    const DataSource = new RemoteGraphQLDataSource({
      url: 'https://api.example.com/foo',
      willSendRequest: (options) => {
        if (options.kind === GraphQLDataSourceRequestKind.INCOMING_OPERATION) {
          options.request.http?.headers.set(
            'x-user-id',
            options.context.userId,
          );
        }
      },
    });

    fetch.mockJSONResponseOnce({ data: { me: 'james' } });

    const { data } = await DataSource.process({
      ...defaultProcessOptions,
      request: {
        query: '{ me { name } }',
        variables: { id: '1' },
      },
      context: { userId: '1234' },
    });

    expect(data).toEqual({ me: 'james' });
    expect(fetch).toHaveFetched('https://api.example.com/foo', {
      body: {
        query: '{ me { name } }',
        variables: { id: '1' },
      },
      headers: {
        'x-user-id': '1234',
      },
    });
  });
});

describe('didReceiveResponse', () => {
  it('can accept and modify context', async () => {
    interface MyContext {
      surrogateKeys: string[];
    }

    class MyDataSource extends RemoteGraphQLDataSource {
      url = 'https://api.example.com/foo';

      didReceiveResponse<MyContext>({
        request,
        response,
      }: Required<
        Pick<
          GraphQLRequestContext<MyContext>,
          'request' | 'response' | 'context'
        >
      >) {
        const surrogateKeys =
          request.http && request.http.headers.get('surrogate-keys');
        if (surrogateKeys) {
          context.surrogateKeys.push(...surrogateKeys.split(' '));
        }
        return response;
      }
    }

    const DataSource = new MyDataSource();

    fetch.mockJSONResponseOnce({ data: { me: 'james' } });

    const context: MyContext = { surrogateKeys: [] };
    await DataSource.process({
      ...defaultProcessOptions,
      request: {
        query: '{ me { name } }',
        variables: { id: '1' },
        http: {
          method: 'GET',
          url: 'https://api.example.com/foo',
          headers: new Headers({ 'Surrogate-Keys': 'abc def' }),
        },
      },
      context,
    });

    expect(context).toEqual({ surrogateKeys: ['abc', 'def'] });
  });

  it('is only called once', async () => {
    class MyDataSource extends RemoteGraphQLDataSource {
      url = 'https://api.example.com/foo';

      didReceiveResponse<MyContext>({
        response,
      }: Required<
        Pick<
          GraphQLRequestContext<MyContext>,
          'request' | 'response' | 'context'
        >
      >) {
        return response;
      }
    }

    const DataSource = new MyDataSource();
    const spyDidReceiveResponse = jest.spyOn(DataSource, 'didReceiveResponse');

    fetch.mockJSONResponseOnce({ data: { me: 'james' } });

    await DataSource.process({
      ...defaultProcessOptions,
      request: {
        query: '{ me { name } }',
        variables: { id: '1' },
      },
    });

    expect(spyDidReceiveResponse).toHaveBeenCalledTimes(1);
  });

  // APQ makes two requests, so make sure only one calls the response hook.
  it('is only called once when apq is enabled', async () => {
    class MyDataSource extends RemoteGraphQLDataSource {
      url = 'https://api.example.com/foo';
      apq = true;

      didReceiveResponse<MyContext>({
        response,
      }: Required<
        Pick<
          GraphQLRequestContext<MyContext>,
          'request' | 'response' | 'context'
        >
      >) {
        return response;
      }
    }

    const DataSource = new MyDataSource();
    const spyDidReceiveResponse = jest.spyOn(DataSource, 'didReceiveResponse');

    fetch.mockJSONResponseOnce({ data: { me: 'james' } });

    await DataSource.process({
      ...defaultProcessOptions,
      request: {
        query: '{ me { name } }',
        variables: { id: '1' },
      },
    });

    expect(spyDidReceiveResponse).toHaveBeenCalledTimes(1);
  });
});

describe('didEncounterError', () => {
  it('can accept and modify context', async () => {
    interface MyContext {
      timingData: { time: number }[];
    }

    class MyDataSource extends RemoteGraphQLDataSource<MyContext> {
      url = 'https://api.example.com/foo';

      didEncounterError() {
        // a timestamp a la `Date.now()`
        context.timingData.push({ time: 1616446845234 });
      }
    }

    const DataSource = new MyDataSource();

    fetch.mockResponseOnce('Invalid token', undefined, 401);

    const context: MyContext = { timingData: [] };
    const result = DataSource.process({
      ...defaultProcessOptions,
      request: {
        query: '{ me { name } }',
      },
      incomingRequestContext: {
        context,
      } as GraphQLRequestContext<MyContext>,
      context,
    });

    await expect(result).rejects.toThrow(AuthenticationError);
    expect(context).toMatchObject({
      timingData: [{ time: 1616446845234 }],
    });
  });
});

describe('error handling', () => {
  it('throws an AuthenticationError when the response status is 401', async () => {
    const DataSource = new RemoteGraphQLDataSource({
      url: 'https://api.example.com/foo',
    });

    fetch.mockResponseOnce('Invalid token', undefined, 401);

    const result = DataSource.process({
      ...defaultProcessOptions,
      request: { query: '{ me { name } }' },
    });
    await expect(result).rejects.toThrow(AuthenticationError);
    await expect(result).rejects.toMatchObject({
      extensions: {
        code: 'UNAUTHENTICATED',
        response: {
          status: 401,
          body: 'Invalid token',
        },
      },
    });
  });

  it('throws a ForbiddenError when the response status is 403', async () => {
    const DataSource = new RemoteGraphQLDataSource({
      url: 'https://api.example.com/foo',
    });

    fetch.mockResponseOnce('No access', undefined, 403);

    const result = DataSource.process({
      ...defaultProcessOptions,
      request: { query: '{ me { name } }' },
    });
    await expect(result).rejects.toThrow(ForbiddenError);
    await expect(result).rejects.toMatchObject({
      extensions: {
        code: 'FORBIDDEN',
        response: {
          status: 403,
          body: 'No access',
        },
      },
    });
  });

  it('throws an ApolloError when the response status is 500', async () => {
    const DataSource = new RemoteGraphQLDataSource({
      url: 'https://api.example.com/foo',
    });

    fetch.mockResponseOnce('Oops', undefined, 500);

    const result = DataSource.process({
      ...defaultProcessOptions,
      request: { query: '{ me { name } }' },
    });
    await expect(result).rejects.toThrow(ApolloError);
    await expect(result).rejects.toMatchObject({
      extensions: {
        response: {
          status: 500,
          body: 'Oops',
        },
      },
    });
  });

  it('puts JSON error responses on the error as an object', async () => {
    const DataSource = new RemoteGraphQLDataSource({
      url: 'https://api.example.com/foo',
    });

    fetch.mockResponseOnce(
      JSON.stringify({
        errors: [
          {
            message: 'Houston, we have a problem.',
          },
        ],
      }),
      { 'Content-Type': 'application/json' },
      500,
    );

    const result = DataSource.process({
      ...defaultProcessOptions,
      request: { query: '{ me { name } }' },
    });
    await expect(result).rejects.toThrow(ApolloError);
    await expect(result).rejects.toMatchObject({
      extensions: {
        response: {
          status: 500,
          body: {
            errors: [
              {
                message: 'Houston, we have a problem.',
              },
            ],
          },
        },
      },
    });
  });
});
