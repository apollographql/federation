import { operationFromDocument } from '@apollo/federation-internals';
import gql from 'graphql-tag';
import { composeAndCreatePlanner } from './testHelper';

describe('merging @skip / @include directives', () => {
  const subgraph1 = {
    name: 'S1',
    typeDefs: gql`
      type Query {
        hello: Hello!
        extraFieldToPreventSkipIncludeNodes: String!
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
          extraFieldToPreventSkipIncludeNodes
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
            }
            hello {
              world
            }
            extraFieldToPreventSkipIncludeNodes
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
          extraFieldToPreventSkipIncludeNodes
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
            }
            hello {
              goodbye
            }
            extraFieldToPreventSkipIncludeNodes
          }
        },
      }
    `);
  });

  it('multiple applications identical', () => {
    const operation = operationFromDocument(
      api,
      gql`
        query Test($skipField: Boolean!, $includeField: Boolean!) {
          hello @skip(if: $skipField) @include(if: $includeField) {
            world
          }
          hello @skip(if: $skipField) @include(if: $includeField) {
            goodbye
          }
          extraFieldToPreventSkipIncludeNodes
        }
      `,
    );

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "S1") {
          {
            hello @skip(if: $skipField) @include(if: $includeField) {
              world
              goodbye
            }
            extraFieldToPreventSkipIncludeNodes
          }
        },
      }
    `);
  });

  it('multiple applications differing order', () => {
    const operation = operationFromDocument(
      api,
      gql`
        query Test($skipField: Boolean!, $includeField: Boolean!) {
          hello @skip(if: $skipField) @include(if: $includeField) {
            world
          }
          hello @include(if: $includeField) @skip(if: $skipField) {
            goodbye
          }
          extraFieldToPreventSkipIncludeNodes
        }
      `,
    );

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "S1") {
          {
            hello @include(if: $includeField) @skip(if: $skipField) {
              world
              goodbye
            }
            extraFieldToPreventSkipIncludeNodes
          }
        },
      }
    `);
  });

  it('multiple applications differing quantity', () => {
    const operation = operationFromDocument(
      api,
      gql`
        query Test($skipField: Boolean!, $includeField: Boolean!) {
          hello @skip(if: $skipField) @include(if: $includeField) {
            world
          }
          hello @include(if: $includeField) {
            goodbye
          }
          extraFieldToPreventSkipIncludeNodes
        }
      `,
    );

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "S1") {
          {
            hello @skip(if: $skipField) @include(if: $includeField) {
              world
            }
            hello @include(if: $includeField) {
              goodbye
            }
            extraFieldToPreventSkipIncludeNodes
          }
        },
      }
    `);
  });
});
