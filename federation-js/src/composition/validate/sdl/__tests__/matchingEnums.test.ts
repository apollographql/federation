import {
  Kind,
  DocumentNode,
  GraphQLSchema,
  specifiedDirectives,
  parse,
} from 'graphql';
import { validateSDL } from 'graphql/validation/validate';
import gql from 'graphql-tag';
import { buildMapsFromServiceList } from '../../../compose';
import {
  astSerializer,
  typeSerializer,
  selectionSetSerializer,
  graphqlErrorSerializer,
} from 'apollo-federation-integration-testsuite';
import federationDirectives from '../../../../directives';
import { ServiceDefinition } from '../../../types';
import { MatchingEnums } from '../matchingEnums';

expect.addSnapshotSerializer(astSerializer);
expect.addSnapshotSerializer(typeSerializer);
expect.addSnapshotSerializer(selectionSetSerializer);
expect.addSnapshotSerializer(graphqlErrorSerializer);

// simulate the first half of the composition process
const createDefinitionsDocumentForServices = (
  serviceList: ServiceDefinition[],
): DocumentNode => {
  const { typeDefinitionsMap } = buildMapsFromServiceList(serviceList);
  return {
    kind: Kind.DOCUMENT,
    definitions: Object.values(typeDefinitionsMap).flat(),
  };
};

describe('matchingEnums', () => {
  let schema: GraphQLSchema;

  // create a blank schema for each test
  beforeEach(() => {
    schema = new GraphQLSchema({
      query: undefined,
      directives: [...specifiedDirectives, ...federationDirectives],
    });
  });

  it('does not error with matching enums across services', () => {
    const serviceList = [
      {
        typeDefs: gql`
          enum ProductCategory {
            BED
            BATH
          }
        `,
        name: 'serviceA',
      },

      {
        typeDefs: gql`
          enum ProductCategory {
            BED
            BATH
          }
        `,
        name: 'serviceB',
      },
    ];

    const definitionsDocument = createDefinitionsDocumentForServices(
      serviceList,
    );
    const errors = validateSDL(definitionsDocument, schema, [MatchingEnums]);
    expect(errors).toHaveLength(0);
  });

  it('errors when enums in separate services dont match', () => {
    const serviceList = [
      {
        typeDefs: parse(`
          enum ProductCategory {
            BED
            BATH
          }
        `),
        name: 'serviceA',
      },
      {
        typeDefs: parse(`
          enum ProductCategory {
            BEYOND
          }
        `),
        name: 'serviceB',
      },
    ];

    const definitionsDocument = createDefinitionsDocumentForServices(
      serviceList,
    );
    const errors = validateSDL(definitionsDocument, schema, [MatchingEnums]);
    expect(errors).toMatchInlineSnapshot(`
      Array [
        Object {
          "code": "ENUM_MISMATCH",
          "locations": Array [
            Object {
              "column": 11,
              "line": 2,
            },
          ],
          "message": "The \`ProductCategory\` enum does not have identical values in all services. Groups of services with identical values are: [serviceA], [serviceB]",
        },
      ]
    `);
  });

  it('errors when enums in separate services dont match', () => {
    const serviceList = [
      {
        typeDefs: parse(`
          type Query {
            products: [Product]!
          }

          type Product @key(fields: "sku") {
            sku: String!
            upc: String!
            type: ProductType
          }

          enum ProductType {
            BOOK
            FURNITURE
          }
        `),
        name: 'serviceA',
      },
      {
        typeDefs: parse(`
          enum ProductType {
            FURNITURE
            BOOK
            DIGITAL
          }
        `),
        name: 'serviceB',
      },
      {
        typeDefs: parse(`
          enum ProductType {
            FURNITURE
            BOOK
            DIGITAL
          }
        `),
        name: 'serviceC',
      },
    ];

    const definitionsDocument = createDefinitionsDocumentForServices(
      serviceList,
    );
    const errors = validateSDL(definitionsDocument, schema, [MatchingEnums]);
    expect(errors).toMatchInlineSnapshot(`
      Array [
        Object {
          "code": "ENUM_MISMATCH",
          "locations": Array [
            Object {
              "column": 11,
              "line": 12,
            },
          ],
          "message": "The \`ProductType\` enum does not have identical values in all services. Groups of services with identical values are: [serviceA], [serviceB, serviceC]",
        },
      ]
    `,
    );
  });

  it('errors when an enum name is defined as another type in a service', () => {
    const serviceList = [
      {
        typeDefs: parse(`
          enum ProductType {
            BOOK
            FURNITURE
          }
        `),
        name: 'serviceA',
      },
      {
        typeDefs: parse(`
          type ProductType {
            id: String
          }
        `),
        name: 'serviceB',
      },
      {
        typeDefs: parse(`
          enum ProductType {
            FURNITURE
            BOOK
            DIGITAL
          }
        `),
        name: 'serviceC',
      },
    ];

    const definitionsDocument = createDefinitionsDocumentForServices(
      serviceList,
    );
    const errors = validateSDL(definitionsDocument, schema, [MatchingEnums]);
    expect(errors).toMatchInlineSnapshot(`
      Array [
        Object {
          "code": "ENUM_MISMATCH_TYPE",
          "locations": Array [
            Object {
              "column": 11,
              "line": 2,
            },
          ],
          "message": "[serviceA] ProductType -> ProductType is an enum in [serviceA, serviceC], but not in [serviceB]",
        },
      ]
    `);
  });
});
