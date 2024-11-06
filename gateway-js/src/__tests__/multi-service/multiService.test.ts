import { unwrapSingleResultKind } from '../gateway/testUtils';
import {ApolloGateway, IntrospectAndCompose, RemoteGraphQLDataSource} from "../../index";
import {ApolloServer} from "@apollo/server";
import {startStandaloneServer} from "@apollo/server/standalone";
import { buildSubgraphSchema } from '@apollo/subgraph';
import {
  dep1,
  dep2,
  dep1Ex,
  dep2Ex,
  xfield,
  mainEntity,
} from 'apollo-federation-integration-testsuite';

async function buildGateway(port: number, useDefaultNullValuesForConnectionErrors: boolean = false) {
  const gateway = new ApolloGateway({
    buildService(x) {
      return new RemoteGraphQLDataSource({ url: x.url }, useDefaultNullValuesForConnectionErrors);
    },
    debug: false,
    supergraphSdl: new IntrospectAndCompose({
      subgraphs: [
        {
          name: 'DEP2',
          url: 'http://localhost:4001/graphql',
        },
        {
          name: 'DEP1',
          url: 'http://localhost:4002/graphql',
        },
        {
          name: 'XFIELD',
          url: 'http://localhost:4003/graphql',
        },
        {
          name: 'BASEGRAPH',
          url: 'http://localhost:4004/graphql',
        },
      ],
    }),
  });

  const server = new ApolloServer({
    gateway,
  });
  const { url } = await startStandaloneServer(server, {
    listen: { port: port },
  });
  console.log(`Gateway running running ${url}`);
  return server;
}

async function buildGQLServer(port: number, definition: any) {
  const typeDefs = definition.typeDefs;
  const resolvers = definition.resolvers;
  const schema = buildSubgraphSchema({ typeDefs, resolvers });
  const server = new ApolloServer({
    schema,
  });
  const { url } = await startStandaloneServer(server, {
    listen: { port: port },
  });

  console.log(`Subgraph running ${url}`);
  return server;
}

describe('Multi-service', () => {
  describe('Multi-service success', () => {
    it('successfully starts and serves requests to the proper services', async () => {
      const dep2ServerRef = await buildGQLServer(4001, dep2);
      const dep1ServerRef = await buildGQLServer(4002, dep1);
      const xfieldServerRef = await buildGQLServer(4003, xfield);
      const mainEntityServerRef = await buildGQLServer(4004, mainEntity);

      const server = await buildGateway(4000);

      const result = await server.executeOperation({
        query:
          '{\n' +
          '  getTemp {\n' +
          '    dep1\n' +
          '    dep2\n' +
          '    xfield\n' +
          '    id\n' +
          '    myText\n' +
          '  }\n' +
          '}',
      });

      expect(unwrapSingleResultKind(result).data).toMatchInlineSnapshot(`
              Object {
                "getTemp": Object {
                  "dep1": 1000,
                  "dep2": 999,
                  "id": "123134431",
                  "myText": "this is a sample",
                  "xfield": 999000,
                },
              }
          `);
      expect(unwrapSingleResultKind(result).errors).toMatchInlineSnapshot(
        `undefined`,
      );
      await server.stop();
      await dep2ServerRef.stop();
      await dep1ServerRef.stop();
      await xfieldServerRef.stop();
      await mainEntityServerRef.stop();
    });
  });

  describe('Multi-service exception returned for a nullable field', () => {
    it('Ignores the nullable dep2 while calculating xfield in case an exception is returned instead of dep2', async () => {
      const dep2ServerExRef = await buildGQLServer(4001, dep2Ex);
      const dep1ServerRef = await buildGQLServer(4002, dep1);
      const xfieldServerRef = await buildGQLServer(4003, xfield);
      const mainEntityServerRef = await buildGQLServer(4004, mainEntity);

      const server = await buildGateway(4000);

      const resul = await server.executeOperation({
        query:
            '{\n' +
            '  getTemp {\n' +
            '    dep1\n' +
            '    dep2\n' +
            '    xfield\n' +
            '    id\n' +
            '    myText\n' +
            '  }\n' +
            '}',
      });

      expect(unwrapSingleResultKind(resul).data).toMatchInlineSnapshot(`
              Object {
                "getTemp": Object {
                  "dep1": 1000,
                  "dep2": null,
                  "id": "123134431",
                  "myText": "this is a sample",
                  "xfield": 1000,
                },
              }
          `);
      expect(unwrapSingleResultKind(resul).errors).toMatchInlineSnapshot(`
              Array [
                Object {
                  "extensions": Object {
                    "code": "INTERNAL_SERVER_ERROR",
                    "serviceName": "DEP2",
                  },
                  "message": "This is a custom error message",
                  "path": Array [
                    "getTemp",
                    "dep2",
                  ],
                },
              ]
          `);
      await server.stop();
      await dep2ServerExRef.stop();
      await dep1ServerRef.stop();
      await xfieldServerRef.stop();
      await mainEntityServerRef.stop();
    });
  });

  describe('Multi-service exception returned for a non-nullable field', () => {
    it('Fails in case the non-nullable dep1 returned an exception instead of a value while calculating xfield', async () => {
      const dep2ServerRef = await buildGQLServer(4001, dep2);
      const dep1ServerExRef = await buildGQLServer(4002, dep1Ex);
      const xfieldServerRef = await buildGQLServer(4003, xfield);
      const mainEntityServerRef = await buildGQLServer(4004, mainEntity);

      const server = await buildGateway(4000);

      const result = await server.executeOperation({
        query:
          '{\n' +
          '  getTemp {\n' +
          '    dep1\n' +
          '    dep2\n' +
          '    xfield\n' +
          '    id\n' +
          '    myText\n' +
          '  }\n' +
          '}',
      });

      expect(unwrapSingleResultKind(result).data).toMatchInlineSnapshot(`
              Object {
                "getTemp": null,
              }
          `);
      expect(unwrapSingleResultKind(result).errors).toMatchInlineSnapshot(`
              Array [
                Object {
                  "extensions": Object {
                    "code": "INTERNAL_SERVER_ERROR",
                    "serviceName": "DEP1",
                  },
                  "message": "This is a custom error message dep1 non-nullable",
                  "path": Array [
                    "getTemp",
                    "dep1",
                  ],
                },
              ]
          `);
      await server.stop();
      await dep2ServerRef.stop();
      await dep1ServerExRef.stop();
      await xfieldServerRef.stop();
      await mainEntityServerRef.stop();
    });
  });

  describe('Multi-service server is down for a nullable field without enabling default null response fix', () => {
    it('It fails to calculate xfield in case the dep2 server is down', async () => {
      const dep2ServerRef = await buildGQLServer(4001, dep2);
      const dep1ServerRef = await buildGQLServer(4002, dep1);
      const xfieldServerRef = await buildGQLServer(4003, xfield);
      const mainEntityServerRef = await buildGQLServer(4004, mainEntity);

      const server = await buildGateway(4000);
      await dep2ServerRef.stop();
      const result = await server.executeOperation({
        query:
          '{\n' +
          '  getTemp {\n' +
          '    dep1\n' +
          '    dep2\n' +
          '    xfield\n' +
          '    id\n' +
          '    myText\n' +
          '  }\n' +
          '}',
      });

      expect(unwrapSingleResultKind(result).data).toMatchInlineSnapshot(`
        Object {
          "getTemp": Object {
            "dep1": 1000,
            "dep2": null,
            "id": "123134431",
            "myText": "this is a sample",
            "xfield": null,
          },
        }
      `);
      expect(unwrapSingleResultKind(result).errors).toMatchInlineSnapshot(`
              Array [
                Object {
                  "extensions": Object {
                    "code": "INTERNAL_SERVER_ERROR",
                  },
                  "message": "request to http://localhost:4001/graphql failed, reason: connect ECONNREFUSED ::1:4001",
                },
              ]
          `);

      await server.stop();

      await dep1ServerRef.stop();
      await xfieldServerRef.stop();
      await mainEntityServerRef.stop();
    });
  });

  describe('Multi-service server is down for a nullable field with enabling default null response fix', () => {
    it('Should ignore the nullable dep2 while calculating xfield in case the dep2 server is down', async () => {
      const dep2ServerRef = await buildGQLServer(4001, dep2);
      const dep1ServerRef = await buildGQLServer(4002, dep1);
      const xfieldServerRef = await buildGQLServer(4003, xfield);
      const mainEntityServerRef = await buildGQLServer(4004, mainEntity);

      const server = await buildGateway(4000, true);
      await dep2ServerRef.stop();
      const result = await server.executeOperation({
        query:
          '{\n' +
          '  getTemp {\n' +
          '    dep1\n' +
          '    dep2\n' +
          '    xfield\n' +
          '    id\n' +
          '    myText\n' +
          '  }\n' +
          '}',
      });

      expect(unwrapSingleResultKind(result).data).toMatchInlineSnapshot(`
              Object {
                "getTemp": Object {
                  "dep1": 1000,
                  "dep2": null,
                  "id": "123134431",
                  "myText": "this is a sample",
                  "xfield": 1000,
                },
              }
          `);
      expect(unwrapSingleResultKind(result).errors).toMatchInlineSnapshot(`
        Array [
          Object {
            "extensions": Object {
              "code": "INTERNAL_SERVER_ERROR",
              "serviceName": "DEP2",
            },
            "message": "Error while connecting to service sending default null values- original error message is:request to http://localhost:4001/graphql failed, reason: connect ECONNREFUSED ::1:4001",
          },
        ]
      `);

      await server.stop();

      await dep1ServerRef.stop();
      await xfieldServerRef.stop();
      await mainEntityServerRef.stop();
    });
  });

  describe('Multi-service server is down for a non-nullable field with enabling default null response fix (preserve behaviour from before the fix)', () => {
    it('Should fail  while calculating xfield in case the non-nullable dep1 server is down', async () => {
      const dep2ServerRef = await buildGQLServer(4001, dep2);
      const dep1ServerRef = await buildGQLServer(4002, dep1);
      const xfieldServerRef = await buildGQLServer(4003, xfield);
      const mainEntityServerRef = await buildGQLServer(4004, mainEntity);

      const server = await buildGateway(4000, true);
      await dep1ServerRef.stop();
      const result = await server.executeOperation({
        query:
          '{\n' +
          '  getTemp {\n' +
          '    dep2\n' +
          '    xfield\n' +
          '    id\n' +
          '    myText\n' +
          '  }\n' +
          '}',
      });

      expect(unwrapSingleResultKind(result).data).toMatchInlineSnapshot(`
        Object {
          "getTemp": Object {
            "dep2": 999,
            "id": "123134431",
            "myText": "this is a sample",
            "xfield": null,
          },
        }
      `);
      expect(unwrapSingleResultKind(result).errors).toMatchInlineSnapshot(`
        Array [
          Object {
            "extensions": Object {
              "code": "INTERNAL_SERVER_ERROR",
            },
            "message": "request to http://localhost:4002/graphql failed, reason: connect ECONNREFUSED ::1:4002",
          },
        ]
      `);

      await server.stop();

      await dep2ServerRef.stop();
      await xfieldServerRef.stop();
      await mainEntityServerRef.stop();
    });
  });
});
