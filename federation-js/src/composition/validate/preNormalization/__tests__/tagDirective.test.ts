import { tagDirective } from '..';
import {
  gql,
  graphqlErrorSerializer,
} from 'apollo-federation-integration-testsuite';

expect.addSnapshotSerializer(graphqlErrorSerializer);

describe('tagDirective', () => {
  describe('reports no errors', () => {
    it('when there are no @tag usages', () => {
      const serviceA = {
        typeDefs: gql`
          type Query {
            product: Product
          }

          type Product {
            sku: String
          }
        `,
        name: 'serviceA',
      };

      const errors = tagDirective(serviceA);
      expect(errors).toHaveLength(0);
    });

    it('when there are @tag usages and a correct @tag definition', () => {
      const serviceA = {
        typeDefs: gql`
          directive @tag(name: String!) repeatable on FIELD_DEFINITION
          type Query {
            hello: String @tag(name: "hello")
          }
        `,
        name: 'serviceA',
      };

      const errors = tagDirective(serviceA);
      expect(errors).toHaveLength(0);
    });
  });

  describe('reports errors', () => {
    it('when @tag is used and no definition is provided', () => {
      const serviceA = {
        typeDefs: gql`
          type Query {
            product: Product
          }

          type Product {
            sku: String @tag(name: "product")
          }
        `,
        name: 'serviceA',
      };

      const errors = tagDirective(serviceA);
      expect(errors).toMatchInlineSnapshot(`
              Array [
                Object {
                  "code": "TAG_DIRECTIVE_DEFINITION_MISSING",
                  "locations": undefined,
                  "message": "[@tag] -> Found @tag usages in service serviceA, but the @tag directive definition wasn't included. Please include the following directive definition in your schema's type definitions:
              	directive @tag(name: String!) repeatable on FIELD_DEFINITION",
                },
              ]
          `);
    });

    it('when @tag usage and definition exist, but definition is incorrect', () => {
      const serviceA = {
        typeDefs: gql`
          directive @tag(name: String!) on FIELD_DEFINITION

          type Query {
            hello: String @tag(name: "hello")
          }
        `,
        name: 'serviceA',
      };

      const errors = tagDirective(serviceA);

      expect(errors).toMatchInlineSnapshot(`
        Array [
          Object {
            "code": "TAG_DIRECTIVE_DEFINITION_INVALID",
            "locations": Array [
              Object {
                "column": 1,
                "line": 2,
              },
            ],
            "message": "[@tag] -> Found @tag definition in service serviceA, but the @tag directive definition was invalid. Please ensure the directive definition in your schema's type definitions matches the following:
        	directive @tag(name: String!) repeatable on FIELD_DEFINITION",
          },
        ]
      `);
    });
  });
});
