import { ApolloGateway } from '@apollo/gateway';
import resolvable from '@josephg/resolvable';
import { GraphQLSchema } from 'graphql';
import { getTestingSupergraphSdl } from '../execution-utils';
const { version } = require('../../../package.json');

describe('addExtensions', () => {
  let gateway: ApolloGateway;

  beforeEach(() => {
    gateway = new ApolloGateway({
      supergraphSdl: getTestingSupergraphSdl(),
    });
  });

  afterEach(async () => {
    await gateway.stop();
  });

  it('has extensions on loaded schemas', async () => {
    const { schema } = await gateway.load();
    expect(schema.extensions).toEqual({
      apollo: { gateway: { version: version } },
    });
  });

  it('has extensions on schema updates', async () => {
    const schemaChangeBlocker = resolvable<{
      apiSchema: GraphQLSchema;
      coreSupergraphSdl: string;
    }>();

    gateway.onSchemaLoadOrUpdate(schemaChangeBlocker.resolve);
    gateway.load();

    const { apiSchema } = await schemaChangeBlocker;
    expect(apiSchema.extensions).toEqual({
      apollo: { gateway: { version: version } },
    });
  });
});
