import { buildSubgraphSchema } from '@apollo/subgraph';
import { ApolloServer, ApolloServerOptionsWithGateway, BaseContext } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { ApolloServerPluginInlineTrace } from '@apollo/server/plugin/inlineTrace';
import { GraphQLSchemaModule } from '@apollo/subgraph/src/schema-helper';
import { ApolloGateway, GatewayConfig } from '../..';
import { ServiceDefinition } from '@apollo/federation-internals';
import fetch, { Response } from 'node-fetch';

export class Services {
  constructor(
    readonly subgraphServers: ApolloServer[],
    readonly gateway: ApolloGateway,
    readonly gatewayServer: ApolloServer,
    readonly gatewayUrl: string,
  ) {
  }

  async queryGateway(query: string): Promise<Response> {
    return fetch(this.gatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
  }

  async stop() {
    for (const server of this.subgraphServers) {
      await server.stop();
    }
    await this.gatewayServer.stop();
  }
}

async function startFederatedServer(modules: GraphQLSchemaModule[]) {
  const schema = buildSubgraphSchema(modules);
  const server = new ApolloServer({
    schema,
    // Manually installing the inline trace plugin means it doesn't log a message.
    plugins: [ApolloServerPluginInlineTrace()],
  });
  const { url } = await startStandaloneServer(server, { listen: { port: 0 } });
  return { url, server };
}

export async function startSubgraphsAndGateway(
  servicesDefs: ServiceDefinition[],
  config?: {
    gatewayConfig?: GatewayConfig;
    gatewayServerConfig?: Partial<ApolloServerOptionsWithGateway<BaseContext>>;
  },
): Promise<Services> {
  const backendServers = [];
  const serviceList = [];
  for (const serviceDef of servicesDefs) {
    const { server, url } = await startFederatedServer([serviceDef]);
    backendServers.push(server);
    serviceList.push({ name: serviceDef.name, url });
  }

  const gateway = new ApolloGateway({
    serviceList,
    ...config?.gatewayConfig,
  });
  const gatewayServer = new ApolloServer({
    gateway,
    ...config?.gatewayServerConfig,
  });
  const { url: gatewayUrl } = await startStandaloneServer(gatewayServer, {
    listen: { port: 0 },
  });
  return new Services(backendServers, gateway, gatewayServer, gatewayUrl);
}
