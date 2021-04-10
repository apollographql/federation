import { fetch } from '../../__mocks__/apollo-server-env';
import { RemoteGraphQLDataSource } from '../../datasources/RemoteGraphQLDataSource';
import { ApolloGateway } from '../../';

beforeEach(() => {
  fetch.mockReset();
});

it('removed fields marked as @internal', async () => {
  fetch.mockJSONResponseOnce({
    data: {
      _service: {
        sdl: `extend type Query { thing: String, thing2: String @internal }`,
      },
    },
  });

  const buildServiceSpy = jest.fn(() => {
    return new RemoteGraphQLDataSource({
      url: 'https://api.example.com/foo',
    });
  });

  const gateway = new ApolloGateway({
    serviceList: [{ name: 'foo', url: 'https://api.example.com/foo' }],
    buildService: buildServiceSpy,
  });

  const { schema } = await gateway.load();

  expect(schema.getQueryType()?.getFields().thing).toBeTruthy();
  expect(schema.getQueryType()?.getFields().thing2).toBeFalsy();
});
