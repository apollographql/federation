import { FEDERATION2_LINK_WITH_FULL_IMPORTS, FieldDefinition } from '@apollo/federation-internals';
import gql from 'graphql-tag';
import { composeServices } from '../compose';

describe('subscription composition tests', () => {
  it('type subscription appears in the supergraph', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        extend schema
          ${FEDERATION2_LINK_WITH_FULL_IMPORTS}
        type Query {
          me: User!
        }

        type Subscription {
          onNewUser: User!
        }

        type User {
          id: ID!
          name: String!
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs:gql`
        extend schema
          ${FEDERATION2_LINK_WITH_FULL_IMPORTS}
        type Query {
          foo: Int
        }

        type Subscription {
          bar: Int
        }
    `,
    };

    const { errors, schema } = composeServices([subgraphA, subgraphB]);
    expect(errors).toBeUndefined();
    expect(schema).toBeDefined();
    const onNewUser = schema?.elementByCoordinate('Subscription.onNewUser') as FieldDefinition<any>;
    expect(onNewUser.appliedDirectives?.[0].toString()).toBe('@join__field(graph: SUBGRAPHA)');
  });

  it.each([
    { directive: '@shareable', errorMsg: 'Fields on root level subscription object cannot be marked as shareable'},
  ])('directives that are incompatible with subscriptions wont compose', ({ directive, errorMsg }) => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        extend schema
          ${FEDERATION2_LINK_WITH_FULL_IMPORTS}
        type Query {
          me: User!
        }

        type Subscription {
          onNewUser: User! ${directive}
        }

        type User {
          id: ID!
          name: String!
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs:gql`
        extend schema
          ${FEDERATION2_LINK_WITH_FULL_IMPORTS}
        type Query {
          foo: Int
        }

        type Subscription {
          bar: Int
        }
    `,
    };

    const { errors, schema } = composeServices([subgraphA, subgraphB]);
    expect(errors?.length).toBe(1);
    expect(errors?.[0].message).toBe(errorMsg);
    expect(schema).toBeUndefined();
  });

  it('subscription name collisions across subgraphs should not compose', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        extend schema
          ${FEDERATION2_LINK_WITH_FULL_IMPORTS}
        type Query {
          me: User!
        }

        type Subscription {
          onNewUser: User
          foo: Int!
        }

        type User {
          id: ID!
          name: String!
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs:gql`
        extend schema
          ${FEDERATION2_LINK_WITH_FULL_IMPORTS}
        type Query {
          foo: Int
        }

        type Subscription {
          foo: Int!
        }
    `,
    };

    const { errors, schema } = composeServices([subgraphA, subgraphB]);
    expect(errors?.length).toBe(1);
    expect(errors?.[0].message).toBe('Non-shareable field "Subscription.foo" is resolved from multiple subgraphs: it is resolved from subgraphs "subgraphA" and "subgraphB" and defined as non-shareable in all of them');
    expect(schema).toBeUndefined();
  });
});
