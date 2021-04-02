import nock from 'nock';
import { MockService } from './networkRequests.test';
import { HEALTH_CHECK_QUERY, SERVICE_DEFINITION_QUERY } from '../..';
import { SUPERGRAPH_SDL_QUERY } from '../../loadSupergraphSdlFromStorage';
import { getTestingSupergraphSdl } from '../../__tests__/execution-utils';
import { print } from 'graphql';
import { fixtures } from 'apollo-federation-integration-testsuite';

export const graphId = 'federated-service';
export const graphVariant = 'current';
export const apiKey = 'service:federated-service:DD71EBbGmsuh-6suUVDwnA';
const apiKeyHash = 'dd55a79d467976346d229a7b12b673ce';

export const mockApolloConfig = {
  apollo: {
    key: apiKey,
    keyHash: apiKeyHash,
    graphId,
    graphVariant,
  },
};

// Service mocks
function mockSdlQuery({ url }: MockService) {
  return nock(url).post('/', {
    query: SERVICE_DEFINITION_QUERY,
  });
}

export function mockSdlQuerySuccess(service: MockService) {
  return mockSdlQuery(service).reply(200, {
    data: { _service: { sdl: print(service.typeDefs) } },
  });
}

export function mockServiceHealthCheck({ url }: MockService) {
  return nock(url).post('/', {
    query: HEALTH_CHECK_QUERY,
  });
}

export function mockServiceHealthCheckSuccess(service: MockService) {
  return mockServiceHealthCheck(service).reply(200, {
    data: { __typename: 'Query' },
  });
}

export function mockAllServicesHealthCheckSuccess() {
  return fixtures.map((fixture) =>
    mockServiceHealthCheck(fixture).reply(200, {
      data: { __typename: 'Query' },
    }),
  );
}

// Supergraph SDL fetching mocks
function gatewayNock(url: Parameters<typeof nock>[0]): nock.Scope {
  const { name, version } = require('../../../package.json');
  return nock(url, {
    reqheaders: {
      'apollographql-client-name': name,
      'apollographql-client-version': version,
      'user-agent': `${name}/${version}`,
      'content-type': 'application/json',
    },
  });
}

export const mockCloudConfigUrl =
  'https://example.cloud-config-url.com/cloudconfig/';

export function mockSupergraphSdlRequest() {
  return gatewayNock(mockCloudConfigUrl).post('/', {
    query: SUPERGRAPH_SDL_QUERY,
    variables: {
      ref: `${graphId}@${graphVariant}`,
      apiKey: apiKey,
    },
  });
}

export function mockSupergraphSdlRequestSuccess(
  supergraphSdl = getTestingSupergraphSdl(),
  id = 'originalId-1234',
) {
  return mockSupergraphSdlRequest().reply(
    200,
    JSON.stringify({
      data: {
        routerConfig: {
          __typename: 'RouterConfigResult',
          id,
          supergraphSdl,
        },
      },
    }),
  );
}
