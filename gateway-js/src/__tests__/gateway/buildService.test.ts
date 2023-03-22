import nock from 'nock';

import { ApolloServer } from '@apollo/server';

import { RemoteGraphQLDataSource } from '../../datasources/RemoteGraphQLDataSource';
import { ApolloGateway, SERVICE_DEFINITION_QUERY } from '../../';
import { fixtures } from 'apollo-federation-integration-testsuite';
import { GraphQLDataSourceRequestKind } from '../../datasources/types';
import { nockAfterEach, nockBeforeEach } from '../nockAssertions';
import { unwrapSingleResultKind } from '../gateway/testUtils';

beforeEach(nockBeforeEach);
afterEach(nockAfterEach);

const replyHeaders = {
  'content-type': 'application/json',
};

it('calls buildService only once per service', async () => {
  nock('https://api.example.com')
    .post('/foo')
    .reply(
      200,
      {
        data: { _service: { sdl: `extend type Query { thing: String }` } },
      },
      replyHeaders,
    );

  const buildServiceSpy = jest.fn(() => {
    return new RemoteGraphQLDataSource({
      url: 'https://api.example.com/foo',
    });
  });

  const gateway = new ApolloGateway({
    serviceList: [{ name: 'foo', url: 'https://api.example.com/foo' }],
    buildService: buildServiceSpy,
  });

  await gateway.load();

  expect(buildServiceSpy).toHaveBeenCalledTimes(1);
});

it('correctly passes the context from ApolloServer to datasources', async () => {
  const gateway = new ApolloGateway({
    localServiceList: fixtures,
    buildService: (_service) => {
      return new RemoteGraphQLDataSource({
        url: 'https://api.example.com/foo',
        willSendRequest: (options) => {
          if (
            options.kind === GraphQLDataSourceRequestKind.INCOMING_OPERATION
          ) {
            options.request.http?.headers.set(
              'x-user-id',
              options.context.userId,
            );
          }
        },
      });
    },
  });

  const server = new ApolloServer({
    gateway,
  });
  await server.start();

  const query = `#graphql
    {
      me {
        username
      }
    }
  `;

  nock('https://api.example.com', {
    reqheaders: {
      'x-user-id': '1234',
    },
  })
    .post('/foo', {
      query: `{me{username}}`,
      variables: {},
    })
    .reply(
      200,
      {
        data: { me: { username: '@apollo-user' } },
      },
      replyHeaders,
    );

  const result = await server.executeOperation(
    {
      query,
    },
    {
      contextValue: {
        userId: '1234',
      },
    },
  );

  const { data, errors } = unwrapSingleResultKind(result);
  expect(errors).toBeUndefined();
  expect(data).toEqual({
    me: { username: '@apollo-user' },
  });
});

function createSdlData(sdl: string): [number, any, Record<string, string>] {
  return [
    200,
    {
      data: {
        _service: {
          sdl: sdl,
        },
      },
    },
    replyHeaders,
  ];
}

it('makes enhanced introspection request using datasource', async () => {
  nock('https://api.example.com', {
    reqheaders: {
      'custom-header': 'some-custom-value',
    },
  })
    .post('/override', {
      query: SERVICE_DEFINITION_QUERY,
    })
    .reply(...createSdlData('extend type Query { one: String }'));

  const gateway = new ApolloGateway({
    serviceList: [
      {
        name: 'one',
        url: 'https://api.example.com/one',
      },
    ],
    buildService: (_service) => {
      return new RemoteGraphQLDataSource({
        url: 'https://api.example.com/override',
        willSendRequest: ({ request }) => {
          request.http?.headers.set('custom-header', 'some-custom-value');
        },
      });
    },
  });

  await gateway.load();
});

it('customizes request on a per-service basis', async () => {
  for (const subgraph of ['one', 'two', 'three']) {
    nock('https://api.example.com', {
      reqheaders: {
        'service-name': subgraph,
      },
    })
      .post(`/${subgraph}`, {
        query: SERVICE_DEFINITION_QUERY,
      })
      .reply(...createSdlData(`extend type Query { ${subgraph}: String }`));
  }

  const gateway = new ApolloGateway({
    serviceList: [
      {
        name: 'one',
        url: 'https://api.example.com/one',
      },
      {
        name: 'two',
        url: 'https://api.example.com/two',
      },
      {
        name: 'three',
        url: 'https://api.example.com/three',
      },
    ],
    buildService: (service) => {
      return new RemoteGraphQLDataSource({
        url: service.url,
        willSendRequest: ({ request }) => {
          request.http?.headers.set('service-name', service.name);
        },
      });
    },
  });

  await gateway.load();
});

it('does not share service definition cache between gateways', async () => {
  let updates = 0;
  const updateObserver: any = (..._args: any[]) => {
    updates += 1;
  };

  function nockSDLFetchOnce() {
    nock('https://api.example.com')
      .post('/repeat', {
        query: SERVICE_DEFINITION_QUERY,
      })
      .reply(...createSdlData('extend type Query { repeat: String }'));
  }

  // Initialize first gateway
  {
    nockSDLFetchOnce();

    const gateway = new ApolloGateway({
      serviceList: [
        {
          name: 'repeat',
          url: 'https://api.example.com/repeat',
        },
      ],
      experimental_didUpdateSupergraph: updateObserver,
    });

    await gateway.load();
  }

  // Initialize second gateway
  {
    nockSDLFetchOnce();

    const gateway = new ApolloGateway({
      serviceList: [
        {
          name: 'repeat',
          url: 'https://api.example.com/repeat',
        },
      ],
      experimental_didUpdateSupergraph: updateObserver,
    });

    await gateway.load();
  }

  expect(updates).toEqual(2);
});
