import {
  ApolloError,
  AuthenticationError,
  ForbiddenError,
} from 'apollo-server-errors';

import { RemoteGraphQLDataSource } from '../RemoteGraphQLDataSource';
import { Response, Headers } from 'node-fetch';
import { GraphQLRequestContext } from '../../typings/server-types';
import { GraphQLDataSourceRequestKind } from '../types';
import { nockBeforeEach, nockAfterEach } from '../../__tests__/nockAssertions';
import nock from 'nock';

beforeEach(nockBeforeEach);
afterEach(nockAfterEach);

const replyHeaders = {
  'content-type': 'application/json',
};

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

      nock('https://api.example.com')
        .post('/foo', { query: '{ me { name } }' })
        .reply(200, { data: { me: 'james' } }, replyHeaders);

      const { data } = await DataSource.process({
        ...defaultProcessOptions,
        request: { query: '{ me { name } }' },
      });

      expect(data).toEqual({ me: 'james' });
    });

    it('passes variables', async () => {
      const DataSource = new RemoteGraphQLDataSource({
        url: 'https://api.example.com/foo',
        apq: false,
      });

      nock('https://api.example.com')
        .post('/foo', { query: '{ me { name } }', variables: { id: '1' } })
        .reply(200, { data: { me: 'james' } }, replyHeaders);

      const { data } = await DataSource.process({
        ...defaultProcessOptions,
        request: {
          query: '{ me { name } }',
          variables: { id: '1' },
        },
      });

      expect(data).toEqual({ me: 'james' });
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

        nock('https://api.example.com')
          .post('/foo', {
            extensions: {
              persistedQuery: {
                version: 1,
                sha256Hash,
              },
            },
          })
          .reply(200, apqNotFoundResponse, replyHeaders);
        nock('https://api.example.com')
          .post('/foo', {
            query,
            extensions: {
              persistedQuery: {
                version: 1,
                sha256Hash,
              },
            },
          })
          .reply(200, { data: { me: 'james' } }, replyHeaders);

        const { data } = await DataSource.process({
          ...defaultProcessOptions,
          request: { query },
        });

        expect(data).toEqual({ me: 'james' });
      });

      it('passes variables', async () => {
        const DataSource = new RemoteGraphQLDataSource({
          url: 'https://api.example.com/foo',
          apq: true,
        });

        nock('https://api.example.com')
          .post('/foo', {
            variables: { id: '1' },
            extensions: {
              persistedQuery: {
                version: 1,
                sha256Hash,
              },
            },
          })
          .reply(200, apqNotFoundResponse, replyHeaders);
        nock('https://api.example.com')
          .post('/foo', {
            query,
            variables: { id: '1' },
            extensions: {
              persistedQuery: {
                version: 1,
                sha256Hash,
              },
            },
          })
          .reply(200, { data: { me: 'james' } }, replyHeaders);

        const { data } = await DataSource.process({
          ...defaultProcessOptions,
          request: {
            query,
            variables: { id: '1' },
          },
        });

        expect(data).toEqual({ me: 'james' });
      });
    });

    describe('hit', () => {
      it('stringifies a request with a query', async () => {
        const DataSource = new RemoteGraphQLDataSource({
          url: 'https://api.example.com/foo',
          apq: true,
        });

        nock('https://api.example.com')
          .post('/foo', {
            extensions: {
              persistedQuery: {
                version: 1,
                sha256Hash,
              },
            },
          })
          .reply(200, { data: { me: 'james' } }, replyHeaders);

        const { data } = await DataSource.process({
          ...defaultProcessOptions,
          request: { query },
        });

        expect(data).toEqual({ me: 'james' });
      });

      it('passes variables', async () => {
        const DataSource = new RemoteGraphQLDataSource({
          url: 'https://api.example.com/foo',
          apq: true,
        });

        nock('https://api.example.com')
          .post('/foo', {
            variables: { id: '1' },
            extensions: {
              persistedQuery: {
                version: 1,
                sha256Hash,
              },
            },
          })
          .reply(200, { data: { me: 'james' } }, replyHeaders);

        const { data } = await DataSource.process({
          ...defaultProcessOptions,
          request: {
            query,
            variables: { id: '1' },
          },
        });

        expect(data).toEqual({ me: 'james' });
      });
    });
  });
});

describe('fetcher', () => {
  it('supports a custom fetcher', async () => {
    const DataSource = new RemoteGraphQLDataSource({
      url: 'https://api.example.com/foo',
      fetcher: async () =>
        new Response(JSON.stringify({ data: { me: 'james' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });

    const { data } = await DataSource.process({
      ...defaultProcessOptions,
      request: {
        query: '{ me { name } }',
        variables: { id: '1' },
      },
    });

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

    nock('https://api.example.com')
      .post('/foo', { query: '{ me { name } }', variables: { id: '2' } })
      .reply(200, { data: { me: 'james' } }, replyHeaders);

    const { data } = await DataSource.process({
      ...defaultProcessOptions,
      request: {
        query: '{ me { name } }',
        variables: { id: '1' },
      },
    });

    expect(data).toEqual({ me: 'james' });
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

    nock('https://api.example.com', {
      reqheaders: { 'x-user-id': '1234' },
    })
      .post('/foo', { query: '{ me { name } }', variables: { id: '1' } })
      .reply(200, { data: { me: 'james' } }, replyHeaders);

    const { data } = await DataSource.process({
      ...defaultProcessOptions,
      request: {
        query: '{ me { name } }',
        variables: { id: '1' },
      },
      context: { userId: '1234' },
    });

    expect(data).toEqual({ me: 'james' });
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

    nock('https://api.example.com')
      .post('/foo', { query: '{ me { name } }', variables: { id: '1' } })
      .reply(200, { data: { me: 'james' } }, replyHeaders);

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

    nock('https://api.example.com')
      .post('/foo', { query: '{ me { name } }', variables: { id: '1' } })
      .reply(200, { data: { me: 'james' } }, replyHeaders);

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

    nock('https://api.example.com')
      .post('/foo')
      .reply(200, { data: { me: 'james' } }, replyHeaders);

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

    nock('https://api.example.com').post('/foo').reply(401, 'Invalid token');

    const context: MyContext = { timingData: [] };
    // @ts-ignore
    const incomingRequestContext: GraphQLRequestContext<MyContext> = { context };
    const result = DataSource.process({
      ...defaultProcessOptions,
      request: {
        query: '{ me { name } }',
      },
      incomingRequestContext,
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

    nock('https://api.example.com').post('/foo').reply(401, 'Invalid token');

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

    nock('https://api.example.com').post('/foo').reply(403, 'No access');

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

    nock('https://api.example.com').post('/foo').reply(500, 'Oops');

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

    nock('https://api.example.com')
      .post('/foo')
      .reply(
        500,
        {
          errors: [
            {
              message: 'Houston, we have a problem.',
            },
          ],
        },
        { 'Content-Type': 'application/json' },
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
