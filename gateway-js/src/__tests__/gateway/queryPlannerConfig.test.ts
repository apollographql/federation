import gql from 'graphql-tag';
import { startSubgraphsAndGateway, Services } from './testUtils'

let services: Services;

afterEach(async () => {
  if (services) {
    await services.stop();
  }
});

describe('`debug.bypassPlannerForSingleSubgraph` config', () => {
  const subgraph = {
    name: 'A',
    url: 'https://A',
    typeDefs: gql`
      type Query {
        a: A
      }

      type A {
        b: B
      }

      type B {
        x: Int
        y: String
      }
    `,
    resolvers: {
      Query: {
        a: () => ({
          b: {
            x: 1,
            y: 'foo',
          }
        }),
      }
    }
  };

  const query = `
    {
      a {
        b {
          x
          y
        }
      }
    }
  `;

  const expectedResult = `
    Object {
      "data": Object {
        "a": Object {
          "b": Object {
            "x": 1,
            "y": "foo",
          },
        },
      },
    }
  `;

  it('is disabled by default', async () => {
    services = await startSubgraphsAndGateway([subgraph]);

    const response = await services.queryGateway(query);
    const result = await response.json();
    expect(result).toMatchInlineSnapshot(expectedResult);

    const queryPlanner = services.gateway.__testing().queryPlanner!;
    // If the query planner is genuinely used, we shoud have evaluated 1 plan.
    expect(queryPlanner.lastGeneratedPlanStatistics()?.evaluatedPlanCount).toBe(1);
  });

  it('works when enabled', async () => {
    services = await startSubgraphsAndGateway(
      [subgraph],
      {
        gatewayConfig: {
          queryPlannerConfig: {
            debug: {
              bypassPlannerForSingleSubgraph: true,
            }
          }
        }
      }
    );

    const response = await services.queryGateway(query);
    const result = await response.json();
    expect(result).toMatchInlineSnapshot(expectedResult);

    const queryPlanner = services.gateway.__testing().queryPlanner!;
    // The `bypassPlannerForSingleSubgraph` doesn't evaluate anything. It's use is the only case where `evaluatedPlanCount` can be 0.
    expect(queryPlanner.lastGeneratedPlanStatistics()?.evaluatedPlanCount).toBe(0);
  });
});

