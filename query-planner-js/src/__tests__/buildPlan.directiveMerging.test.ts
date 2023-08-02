import { operationFromDocument } from '@apollo/federation-internals';
import gql from 'graphql-tag';
import { composeAndCreatePlanner } from './testHelper';

describe('merging @skip / @include directives', () => {
  const subgraph1 = {
    name: 'S1',
    typeDefs: gql`
      type Query {
        hello: Hello!
        extraFieldPreventSkipNode: String!
      }

      type Hello {
        world: String!
        goodbye: String!
      }
    `,
  };

  const [api, queryPlanner] = composeAndCreatePlanner(subgraph1);

  it('with fragment', () => {
    const operation = operationFromDocument(
      api,
      gql`
        query Test($skipField: Boolean!) {
          ...ConditionalSkipFragment
          hello {
            world
          }
          extraFieldPreventSkipNode
        }

        fragment ConditionalSkipFragment on Query {
          hello @skip(if: $skipField) {
            goodbye
          }
        }
      `,
    );

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "S1") {
          {
            hello @skip(if: $skipField) {
              goodbye
              world
            }
            extraFieldPreventSkipNode
          }
        },
      }
    `);
  });

  it('without fragment', () => {
    const operation = operationFromDocument(
      api,
      gql`
        query Test($skipField: Boolean!) {
          hello @skip(if: $skipField) {
            world
          }
          hello {
            goodbye
          }
          extraFieldPreventSkipNode
        }
      `,
    );

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "S1") {
          {
            hello @skip(if: $skipField) {
              world
              goodbye
            }
            extraFieldPreventSkipNode
          }
        },
      }
    `);
  });
});
