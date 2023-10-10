import { serverAudits } from 'graphql-http';
import fetch from 'node-fetch';
import { ApolloGateway } from '..';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { getTestingSupergraphSdl } from './execution-utils';

describe('httpSpecTests.ts', () => {
  let gatewayServer: ApolloServer;
  let gatewayUrl: string;

  beforeAll(async () => {
    gatewayServer = new ApolloServer({
      gateway: new ApolloGateway({
        supergraphSdl: getTestingSupergraphSdl(),
      }),
      // The test doesn't know we should send apollo-require-preflight along
      // with GETs. We could override `fetchFn` to add it but this seems simple enough.
      csrfPrevention: false,
    });
    ({ url: gatewayUrl } = await startStandaloneServer(gatewayServer, {
      listen: { port: 0 },
    }));
  });

  afterAll(async () => {
    await gatewayServer.stop();
  });

  for (const audit of serverAudits({
    url: () => gatewayUrl,
    fetchFn: fetch,
  })) {
    test(audit.name, async () => {
      const result = await audit.fn();

      if (result.status === 'ok') {
        return;
      }
      if (result.status === 'error') {
        throw new Error(result.reason);
      }

      if (result.status !== 'warn') {
        throw new Error(`unknown status ${result.status}`);
      }

      // We failed an optional audit. That's OK, but let's make sure it's
      // one of the ones we expect to fail!

      // The spec has a bunch of optional suggestions which say that you
      // should use 200 rather than 400 for various errors unless opting in to
      // the new application/graphql-response+json response type. That's based
      // on the theory that "400 + application/json" might come from some
      // random proxy layer rather than an actual GraphQL processor and so it
      // shouldn't be relied on. (It *does* expect you to use 400 for these
      // errors when returning `application/graphql-response+json`, and we
      // pass those tests.) For now, we ignore these optional failures but we
      // should fix them in the next major version.
      const expectedWarning400InsteadOf200Ids = [
        '572B', // SHOULD use 200 status code on document parsing failure when accepting application/json
        'FDE2', // SHOULD use 200 status code on validation failure when accepting application/json
        '7B9B', // SHOULD use a status code of 200 on variable coercion failure when accepting application/json
      ];

      if (
        expectedWarning400InsteadOf200Ids.includes(audit.id) &&
        result.response.status === 400
      ) {
        return;
      }

      throw new Error(result.reason);
    });
  }
});
