import gql from 'graphql-tag';
import {ApolloGateway, LocalGraphQLDataSource} from '../../';
import {fixtures, spanSerializer} from 'apollo-federation-integration-testsuite';
import {fetch} from '../../__mocks__/apollo-server-env';
import {InMemorySpanExporter, SimpleSpanProcessor} from '@opentelemetry/tracing'
import {NodeTracerProvider} from '@opentelemetry/node';
import { buildSubgraphSchema } from '@apollo/subgraph';

expect.addSnapshotSerializer(spanSerializer);

const inMemorySpans = new InMemorySpanExporter();
const tracerProvider = new NodeTracerProvider();
tracerProvider.addSpanProcessor(new SimpleSpanProcessor(inMemorySpans));
tracerProvider.register();

beforeEach(() => {
  fetch.mockReset();
  inMemorySpans.reset();
});

describe('opentelemetry', () => {
  async function execute(executor: any, source: string, variables: any, operationName: string) {
    await executor({
      source,
      document: gql(source),
      request: {
        variables,
      },
      operationName,
      queryHash: 'hashed',
      context: null,
      cache: {} as any,
    });
  }

  describe('with local data', () =>
  {
    async function gateway() {
      const gateway = new ApolloGateway({
        localServiceList: fixtures,
        buildService: service => {
          // @ts-ignore
          return new LocalGraphQLDataSource(buildSubgraphSchema([service]));
        },
      });

      const {executor} = await gateway.load();
      return executor;
    }

    it('receives spans on success', async () => {
      const executor = await gateway();

      const source = `#graphql
      query GetProduct($upc: String!) {
        product(upc: $upc) {
          name
        }
      }
    `;

      await execute(executor, source, {upc: '1'}, 'GetProduct');
      expect(inMemorySpans.getFinishedSpans()).toMatchSnapshot();
    });

    it('receives spans on validation failure', async () => {
      const executor = await gateway();
      const source = `#graphql
      query InvalidVariables($first: Int!) {
        topReviews(first: $first) {
          body
        }
      }
    `;

      await execute(executor, source, { upc: '1' }, 'InvalidVariables');
      expect(inMemorySpans.getFinishedSpans()).toMatchSnapshot();
    });

    it('receives spans on plan failure', async () => {
      const executor = await gateway();
      const source = `#graphql
      subscription GetProduct($upc: String!) {
        product(upc: $upc) {
          name
        }
      }
    `;

      try {
        await execute(executor, source, {upc: '1'}, 'GetProduct');
      }
      catch(err) {}
      expect(inMemorySpans.getFinishedSpans()).toMatchSnapshot();
    });
  });


  it('receives spans on fetch failure', async () => {

    fetch.mockImplementationOnce(async () => {
      throw Error("Nooo");
    });

    const gateway = new ApolloGateway({
      localServiceList: fixtures,
    });

    const { executor } = await gateway.load();

    const source = `#graphql
    query GetProduct($upc: String!) {
      product(upc: $upc) {
        name
      }
    }
    `;

    await execute(executor, source, {upc: '1'}, 'GetProduct');
    expect(inMemorySpans.getFinishedSpans()).toMatchSnapshot();
  });
});
