import nock from 'nock';
import { MockService } from './networkRequests.test';
import { HEALTH_CHECK_QUERY, SERVICE_DEFINITION_QUERY } from '../..';
import { CSDL_QUERY } from '../../loadCsdlFromStorage';
import { getTestingCsdl } from '../../__tests__/execution-utils';
import { print } from 'graphql';
import { fixtures } from 'apollo-federation-integration-testsuite';

export const graphId = 'federated-service';
export const graphVariant = 'current';
export const apiKey = 'service:federated-service:DD71EBbGmsuh-6suUVDwnA';
export const apiKeyHash = 'dd55a79d467976346d229a7b12b673ce';

// Service mocks
function mockSDLQuery({ url }: MockService) {
  return nock(url).post('/', {
    query: SERVICE_DEFINITION_QUERY,
  });
}

// TODO: do we need the manual call to print?
export function mockSDLQuerySuccess(service: MockService) {
  mockSDLQuery(service).reply(200, {
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

// CSDL fetching mocks
function gatewayNock(url: Parameters<typeof nock>[0]): nock.Scope {
  return nock(url, {
    reqheaders: {
      'user-agent': `apollo-gateway/${
        require('../../../package.json').version
      }`,
    },
  });
}

export function mockCsdlRequest() {
  return gatewayNock(
    'https://us-central1-mdg-services.cloudfunctions.net:443/cloudconfig-staging',
  ).post('/', {
    query: CSDL_QUERY,
    variables: {
      ref: `${graphId}@${graphVariant}`,
      apiKey: apiKey,
    },
  });
}

export function mockCsdlRequestSuccess(csdl = getTestingCsdl(), id = "1234") {
  return mockCsdlRequest().reply(
    200,
    JSON.stringify({
      data: {
        routerConfig: {
          __typename: 'RouterConfigResult',
          id,
          csdl,
        },
      },
    }),
  );
}
