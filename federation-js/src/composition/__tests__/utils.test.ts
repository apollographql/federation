import gql from 'graphql-tag';
import { print, TypeDefinitionNode } from 'graphql';
import { stripExternalFieldsFromTypeDefs, diffTypeNodes } from '../utils';
import { astSerializer } from 'apollo-federation-integration-testsuite';

expect.addSnapshotSerializer(astSerializer);

describe('Composition utility functions', () => {
  describe('diffTypeNodes', () => {
    it('should produce an empty diff for the same type', () => {
      const typeDefs = gql`
        type Product {
          name: String
        }
      `;

      const def = typeDefs.definitions[0] as TypeDefinitionNode;

      const result = diffTypeNodes(def, def);

      expect(result).toEqual({
        name: [],
        kind: [],
        fields: {},
        fieldArgs: {},
        unionTypes: {},
        locations: [],
        directiveArgs: {}
      });
    });

    it('should produce a diff on two types with different names', () => {
      const typeDefs = gql`
        type A
        type B
      `;

      const defA = typeDefs.definitions[0] as TypeDefinitionNode;
      const defB = typeDefs.definitions[1] as TypeDefinitionNode;

      const result = diffTypeNodes(defA, defB);

      expect(result).toEqual({
        name: ['A','B'],
        kind: [],
        fields: {},
        fieldArgs: {},
        unionTypes: {},
        locations: [],
        directiveArgs: {}
      });
    });

    it('should produce a diff on two different types', () => {
      const typeDefs = gql`
        type A
        input A
      `;

      const defA = typeDefs.definitions[0] as TypeDefinitionNode;
      const defB = typeDefs.definitions[1] as TypeDefinitionNode;

      const result = diffTypeNodes(defA, defB);

      expect(result).toEqual({
        name: [],
        kind: ['ObjectTypeDefinition', 'InputObjectTypeDefinition'],
        fields: {},
        fieldArgs: {},
        unionTypes: {},
        locations: [],
        directiveArgs: {}
      });
    });

    it('should produce a diff on types with different field names', () => {
      const typeDefs = gql`
        type A {
          x: String
        }
        type A {
          y: String
        }
      `;

      const defA = typeDefs.definitions[0] as TypeDefinitionNode;
      const defB = typeDefs.definitions[1] as TypeDefinitionNode;

      const result = diffTypeNodes(defA, defB);

      expect(result).toEqual({
        name: [],
        kind: [],
        fields: {
          x: ['String'],
          y: ['String']
        },
        fieldArgs: {},
        unionTypes: {},
        locations: [],
        directiveArgs: {}
      });
    });

    it('should produce a diff on types with different field types', () => {
      const typeDefs = gql`
        type A {
          x: String
        }
        type A {
          x: String!
        }
      `;

      const defA = typeDefs.definitions[0] as TypeDefinitionNode;
      const defB = typeDefs.definitions[1] as TypeDefinitionNode;

      const result = diffTypeNodes(defA, defB);

      expect(result).toEqual({
        name: [],
        kind: [],
        fields: {
          x: ['String','String!'],
        },
        fieldArgs: {},
        unionTypes: {},
        locations: [],
        directiveArgs: {}
      });
    });

    it('should produce a diff on types with different field arguments', () => {
      const typeDefs = gql`
        type A {
          x(i: Int): String
        }
        type A {
          x(j: Int): String
        }
      `;

      const defA = typeDefs.definitions[0] as TypeDefinitionNode;
      const defB = typeDefs.definitions[1] as TypeDefinitionNode;

      const result = diffTypeNodes(defA, defB);

      expect(result).toEqual({
        name: [],
        kind: [],
        fields: {},
        fieldArgs: {
          x: {
            i: ['Int'],
            j: ['Int']
          }
        },
        unionTypes: {},
        locations: [],
        directiveArgs: {}
      });
    });

    it('should produce a diff on types with different number of arguments', () => {
      const typeDefs = gql`
        type A {
          x(i: Int, k: Int): String
        }
        type A {
          x(i: Int): String
        }
      `;

      const defA = typeDefs.definitions[0] as TypeDefinitionNode;
      const defB = typeDefs.definitions[1] as TypeDefinitionNode;

      const result = diffTypeNodes(defA, defB);

      expect(result).toEqual({
        name: [],
        kind: [],
        fields: {},
        fieldArgs: {
          x: {
            k: ['Int']
          }
        },
        unionTypes: {},
        locations: [],
        directiveArgs: {}
      });
    });

    it('should produce a diff on types with different field arguments', () => {
      const typeDefs = gql`
        type A {
          x(i: Int): String
        }
        type A {
          x(j: Int): String
        }
      `;

      const defA = typeDefs.definitions[0] as TypeDefinitionNode;
      const defB = typeDefs.definitions[1] as TypeDefinitionNode;

      const result = diffTypeNodes(defA, defB);

      expect(result).toEqual({
        name: [],
        kind: [],
        fields: {},
        fieldArgs: {
          x: {
            i: ['Int'],
            j: ['Int']
          }
        },
        unionTypes: {},
        locations: [],
        directiveArgs: {}
      });
    });

    it('should produce a diff on types with field arguments of different types', () => {
      const typeDefs = gql`
        type A {
          x(i: Int): String
        }
        type A {
          x(i: Int!): String
        }
      `;

      const defA = typeDefs.definitions[0] as TypeDefinitionNode;
      const defB = typeDefs.definitions[1] as TypeDefinitionNode;

      const result = diffTypeNodes(defA, defB);

      expect(result).toEqual({
        name: [],
        kind: [],
        fields: {},
        fieldArgs: {
          x: {
            i: ['Int','Int!']
          }
        },
        unionTypes: {},
        locations: [],
        directiveArgs: {}
      });
    });

    it('should produce a diff on inputs with different field names', () => {
      const typeDefs = gql`
        input A {
          x: String
        }
        input A {
          y: String
        }
      `;

      const defA = typeDefs.definitions[0] as TypeDefinitionNode;
      const defB = typeDefs.definitions[1] as TypeDefinitionNode;

      const result = diffTypeNodes(defA, defB);

      expect(result).toEqual({
        name: [],
        kind: [],
        fields: {
          x: ['String'],
          y: ['String']
        },
        fieldArgs: {},
        unionTypes: {},
        locations: [],
        directiveArgs: {}
      });
    });

    it('should produce a diff on inputs with different field types', () => {
      const typeDefs = gql`
        input A {
          x: String
        }
        input A {
          x: String!
        }
      `;

      const defA = typeDefs.definitions[0] as TypeDefinitionNode;
      const defB = typeDefs.definitions[1] as TypeDefinitionNode;

      const result = diffTypeNodes(defA, defB);

      expect(result).toEqual({
        name: [],
        kind: [],
        fields: {
          x: ['String','String!'],
        },
        fieldArgs: {},
        unionTypes: {},
        locations: [],
        directiveArgs: {}
      });
    });

    it('should produce a diff on interfaces with different field names', () => {
      const typeDefs = gql`
        interface A {
          x: String
        }
        interface A {
          y: String
        }
      `;

      const defA = typeDefs.definitions[0] as TypeDefinitionNode;
      const defB = typeDefs.definitions[1] as TypeDefinitionNode;

      const result = diffTypeNodes(defA, defB);

      expect(result).toEqual({
        name: [],
        kind: [],
        fields: {
          x: ['String'],
          y: ['String']
        },
        fieldArgs: {},
        unionTypes: {},
        locations: [],
        directiveArgs: {}
      });
    });

    it('should produce a diff on interface with different field types', () => {
      const typeDefs = gql`
        interface A {
          x: String
        }
        interface A {
          x: String!
        }
      `;

      const defA = typeDefs.definitions[0] as TypeDefinitionNode;
      const defB = typeDefs.definitions[1] as TypeDefinitionNode;

      const result = diffTypeNodes(defA, defB);

      expect(result).toEqual({
        name: [],
        kind: [],
        fields: {
          x: ['String','String!'],
        },
        fieldArgs: {},
        unionTypes: {},
        locations: [],
        directiveArgs: {}
      });
    });

    it('should produce a diff on interface with field with different arguments', () => {
      const typeDefs = gql`
        interface A {
          x(i: Int): String
        }
        interface A {
          x(j: Int): String
        }
      `;

      const defA = typeDefs.definitions[0] as TypeDefinitionNode;
      const defB = typeDefs.definitions[1] as TypeDefinitionNode;

      const result = diffTypeNodes(defA, defB);

      expect(result).toEqual({
        name: [],
        kind: [],
        fields: {},
        fieldArgs: {
          x: {
            i: ['Int'],
            j: ['Int']
          }
        },
        unionTypes: {},
        locations: [],
        directiveArgs: {}
      });
    });

    it('should produce a diff on interface with field with different argument types', () => {
      const typeDefs = gql`
        interface A {
          x(i: Int): String
        }
        interface A {
          x(i: Int!): String
        }
      `;

      const defA = typeDefs.definitions[0] as TypeDefinitionNode;
      const defB = typeDefs.definitions[1] as TypeDefinitionNode;

      const result = diffTypeNodes(defA, defB);

      expect(result).toEqual({
        name: [],
        kind: [],
        fields: {},
        fieldArgs: {
          x: {
            i: ['Int','Int!']
          }
        },
        unionTypes: {},
        locations: [],
        directiveArgs: {}
      });
    });

    it('should produce a diff on interface with field with different number of arguments', () => {
      const typeDefs = gql`
        interface A {
          x(i: Int): String
        }
        interface A {
          x(i: Int, j: String): String
        }
      `;

      const defA = typeDefs.definitions[0] as TypeDefinitionNode;
      const defB = typeDefs.definitions[1] as TypeDefinitionNode;

      const result = diffTypeNodes(defA, defB);

      expect(result).toEqual({
        name: [],
        kind: [],
        fields: {},
        fieldArgs: {
          x: {
            j: ['String']
          }
        },
        unionTypes: {},
        locations: [],
        directiveArgs: {}
      });
    });

    it('should produce a diff on two directives with different locations', () => {
      const typeDefs = gql`
        directive @custom on FIELD | ENUM
        directive @custom on FIELD
      `;

      const defA = typeDefs.definitions[0] as TypeDefinitionNode;
      const defB = typeDefs.definitions[1] as TypeDefinitionNode;

      const result = diffTypeNodes(defA, defB);

      expect(result).toEqual({
        name: [],
        kind: [],
        fields: {},
        fieldArgs: {},
        unionTypes: {},
        locations: [
          'ENUM'
        ],
        directiveArgs: {}
      });
    });

    it('should produce a diff on two directives with different arguments', () => {
      const typeDefs = gql`
        directive @custom(a: String!) on FIELD
        directive @custom(b: String!) on FIELD
      `;

      const defA = typeDefs.definitions[0] as TypeDefinitionNode;
      const defB = typeDefs.definitions[1] as TypeDefinitionNode;

      const result = diffTypeNodes(defA, defB);

      expect(result).toEqual({
        name: [],
        kind: [],
        fields: {},
        fieldArgs: {},
        unionTypes: {},
        locations: [],
        directiveArgs: {
          a: ['String!'],
          b: ['String!']
        }
      });
    });

    it('should produce a diff on two directives with different argument types', () => {
      const typeDefs = gql`
        directive @custom(a: String!) on FIELD
        directive @custom(a: String) on FIELD
      `;

      const defA = typeDefs.definitions[0] as TypeDefinitionNode;
      const defB = typeDefs.definitions[1] as TypeDefinitionNode;

      const result = diffTypeNodes(defA, defB);

      expect(result).toEqual({
        name: [],
        kind: [],
        fields: {},
        fieldArgs: {},
        unionTypes: {},
        locations: [],
        directiveArgs: {
          a: ['String!','String']
        }
      });
    });

    it('should produce a diff on two directives with different number of arguments', () => {
      const typeDefs = gql`
        directive @custom(a: String!) on FIELD
        directive @custom(a: String!, b: Int) on FIELD
      `;

      const defA = typeDefs.definitions[0] as TypeDefinitionNode;
      const defB = typeDefs.definitions[1] as TypeDefinitionNode;

      const result = diffTypeNodes(defA, defB);

      expect(result).toEqual({
        name: [],
        kind: [],
        fields: {},
        fieldArgs: {},
        unionTypes: {},
        locations: [],
        directiveArgs: {
          b: ['Int']
        }
      });
    });

    it('should produce a diff for difference union types', () => {
      const typeDefs = gql`
        union UnionA = A | B
        union UnionA = B | C
      `;

      const defA = typeDefs.definitions[0] as TypeDefinitionNode;
      const defB = typeDefs.definitions[1] as TypeDefinitionNode;

      const result = diffTypeNodes(defA, defB);

      expect(result).toEqual({
        name: [],
        kind: [],
        fields: {},
        fieldArgs: {},
        unionTypes: {
          A: true,
          C: true
        },
        locations: [],
        directiveArgs: {}
      });
    });
  });

  describe('stripExternalFieldsFromTypeDefs', () => {
    it('returns a new DocumentNode with @external fields removed as well as information about the removed fields', () => {
      const typeDefs = gql`
        type Query {
          product: Product
        }

        extend type Product @key(fields: "sku") {
          sku: String @external
        }

        type Mutation {
          updateProduct: Product
        }

        extend interface Account @key(fields: "id") {
          id: ID! @external
        }
      `;

      const {
        typeDefsWithoutExternalFields,
        strippedFields,
      } = stripExternalFieldsFromTypeDefs(typeDefs, 'serviceA');

      expect(typeDefsWithoutExternalFields).toMatchInlineSnapshot(`
        type Query {
          product: Product
        }

        extend type Product @key(fields: "sku")

        type Mutation {
          updateProduct: Product
        }

        extend interface Account @key(fields: "id")
      `);

      expect(strippedFields).toMatchInlineSnapshot(`
                Array [
                  Object {
                    "field": sku: String @external,
                    "parentTypeName": "Product",
                    "serviceName": "serviceA",
                  },
                  Object {
                    "field": id: ID! @external,
                    "parentTypeName": "Account",
                    "serviceName": "serviceA",
                  },
                ]
            `);
    });

    it("doesn't alter the input DocumentNode", () => {
      const typeDefs = gql`
        type Query {
          product: Product
        }

        extend type Product @key(fields: "sku") {
          sku: String @external
        }

        type Mutation {
          updateProduct: Product
        }
      `;
      const originalPrinted = print(typeDefs);

      stripExternalFieldsFromTypeDefs(typeDefs, 'serviceA');

      expect(print(typeDefs)).toEqual(originalPrinted);
    });
  });
});
