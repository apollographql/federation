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
          directive @tag(
            name: String!
          ) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION
          type Query {
            hello: String @tag(name: "hello")
          }
        `,
        name: 'serviceA',
      };

      const errors = tagDirective(serviceA);
      expect(errors).toHaveLength(0);
    });

    it('permits descriptions in the @tag definition', () => {
      const serviceA = {
        typeDefs: gql`
          """
          description
          """
          directive @tag(
            """
            description
            """
            name: String!
          ) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION
          type Query {
            hello: String @tag(name: "hello")
          }
        `,
        name: 'serviceA',
      };

      const errors = tagDirective(serviceA);
      expect(errors).toHaveLength(0);
    });

    it('permits alternative, compatible @tag definitions', () => {
      const serviceA = {
        typeDefs: gql`
          directive @tag(name: String!) on FIELD_DEFINITION | INTERFACE
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
            "code": "MISSING_ERROR",
            "locations": Array [
              Object {
                "column": 15,
                "line": 7,
              },
            ],
            "message": "Unknown directive \\"@tag\\".",
          },
        ]
      `);
    });

    describe('incompatible definition', () => {
      it('locations incompatible', () => {
        const serviceA = {
          typeDefs: gql`
            directive @tag(name: String!) on FIELD_DEFINITION | SCHEMA

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
              "message": "[@tag] -> Found @tag definition in service serviceA, but the @tag directive definition was invalid. Please ensure the directive definition in your schema's type definitions is compatible with the following:
          	directive @tag(name: String!) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION",
            },
          ]
        `);
      });

      it('name arg missing', () => {
        const serviceA = {
          typeDefs: gql`
            directive @tag on FIELD_DEFINITION

            type Query {
              hello: String @tag
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
              "message": "[@tag] -> Found @tag definition in service serviceA, but the @tag directive definition was invalid. Please ensure the directive definition in your schema's type definitions is compatible with the following:
          	directive @tag(name: String!) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION",
            },
          ]
        `);
      });

      it('name arg incompatible', () => {
        const serviceA = {
          typeDefs: gql`
            directive @tag(name: String) on FIELD_DEFINITION

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
              "message": "[@tag] -> Found @tag definition in service serviceA, but the @tag directive definition was invalid. Please ensure the directive definition in your schema's type definitions is compatible with the following:
          	directive @tag(name: String!) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION",
            },
          ]
        `);
      });

      it('additional args', () => {
        const serviceA = {
          typeDefs: gql`
            directive @tag(name: String!, additional: String) on FIELD_DEFINITION

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
              "message": "[@tag] -> Found @tag definition in service serviceA, but the @tag directive definition was invalid. Please ensure the directive definition in your schema's type definitions is compatible with the following:
          	directive @tag(name: String!) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION",
            },
          ]
        `);
      });
    });

    it('when @tag usage is missing args', () => {
      const serviceA = {
        typeDefs: gql`
          directive @tag(
            name: String!
          ) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION

          type Query {
            hello: String @tag
          }
        `,
        name: 'serviceA',
      };

      const errors = tagDirective(serviceA);

      expect(errors).toMatchInlineSnapshot(`
        Array [
          Object {
            "code": "MISSING_ERROR",
            "locations": Array [
              Object {
                "column": 17,
                "line": 7,
              },
            ],
            "message": "Directive \\"@tag\\" argument \\"name\\" of type \\"String!\\" is required, but it was not provided.",
          },
        ]
      `);
    });

    it('when @tag usage has invalid args', () => {
      const serviceA = {
        typeDefs: gql`
          directive @tag(
            name: String!
          ) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION

          type Query {
            hello: String @tag(invalid: 1)
          }
        `,
        name: 'serviceA',
      };

      const errors = tagDirective(serviceA);

      expect(errors).toMatchInlineSnapshot(`
        Array [
          Object {
            "code": "MISSING_ERROR",
            "locations": Array [
              Object {
                "column": 22,
                "line": 7,
              },
            ],
            "message": "Unknown argument \\"invalid\\" on directive \\"@tag\\".",
          },
          Object {
            "code": "MISSING_ERROR",
            "locations": Array [
              Object {
                "column": 17,
                "line": 7,
              },
            ],
            "message": "Directive \\"@tag\\" argument \\"name\\" of type \\"String!\\" is required, but it was not provided.",
          },
        ]
      `);
    });
  });
});
