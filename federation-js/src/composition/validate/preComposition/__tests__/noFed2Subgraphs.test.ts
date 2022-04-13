import { noFed2Subgraphs as validateNoFed2Subgraphs } from '../';
import {
  gql,
  graphqlErrorSerializer,
} from 'apollo-federation-integration-testsuite';

expect.addSnapshotSerializer(graphqlErrorSerializer);

describe('noFed2Subgraphs', () => {
  it('does not compose when fed2 semantics are detected. fed2.0', () => {
    const serviceA = {
      typeDefs: gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.0",
            import: [ "@key" ]
          )
        type Product @key(fields: "color { id value }") {
          sku: String!
          upc: String!
          color: Color!
        }

        type Color {
          id: ID!
          value: String!
        }
      `,
      name: 'serviceA',
    };

    const errors = validateNoFed2Subgraphs(serviceA);
    expect(errors).toMatchInlineSnapshot(`
      Array [
        Object {
          "code": "NO_FED2_SUBGRAPHS",
          "locations": Array [],
          "message": "[serviceA] Schema contains a Federation 2 subgraph. Only federation 1 subgraphs can be composed with the fed1 composer.",
        },
      ]
    `);
  });

  it('does not compose when fed2 semantics are detected. link 1.0', () => {
    const serviceA = {
      typeDefs: gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/link/v1.0"
          )
        type Product @key(fields: "color { id value }") {
          sku: String!
          upc: String!
          color: Color!
        }

        type Color {
          id: ID!
          value: String!
        }
      `,
      name: 'serviceA',
    };

    const errors = validateNoFed2Subgraphs(serviceA);
    expect(errors).toMatchInlineSnapshot(`
      Array [
        Object {
          "code": "NO_FED2_SUBGRAPHS",
          "locations": Array [],
          "message": "[serviceA] Schema contains a Federation 2 subgraph. Only federation 1 subgraphs can be composed with the fed1 composer.",
        },
      ]
    `);
  });


  it('composes just fine when versions are sufficiently old', () => {
    const serviceA = {
      typeDefs: gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/link/v0.2"
          )
          @link(
            url: "https://specs.apollo.dev/federation/v1.0"
          )
        type Product @key(fields: "color { id value }") {
          sku: String!
          upc: String!
          color: Color!
        }

        type Color {
          id: ID!
          value: String!
        }
      `,
      name: 'serviceA',
    };

    const errors = validateNoFed2Subgraphs(serviceA);
    expect(errors).toEqual([]);
  });
});
