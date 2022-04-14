import { GraphQLResolverMap } from '../resolverMap';
import { fed2gql as gql } from '../utils/fed2gql';

export const name = 'inventory';
export const url = `https://${name}.api.com.invalid`;
export const typeDefs = gql`
  directive @stream on FIELD
  directive @transform(from: String!) on FIELD

  interface Product {
    inStock: Boolean
  }

  type Furniture implements Product @key(fields: "sku") {
    sku: String!
    inStock: Boolean
    isHeavy: Boolean
  }

  type Book implements Product @key(fields: "isbn") {
    isbn: String!
    inStock: Boolean
    isCheckedOut: Boolean
  }

  type UserMetadata {
    description: String @external
  }

  type User @key(fields: "id") {
    id: ID!
    metadata: [UserMetadata] @external
    goodDescription: Boolean @requires(fields: "metadata { description }")
  }
`;

const inventory = [
  { sku: 'TABLE1', inStock: true, isHeavy: false },
  { sku: 'COUCH1', inStock: false, isHeavy: true },
  { sku: 'CHAIR1', inStock: true, isHeavy: false },
  { isbn: '0262510871', inStock: true, isCheckedOut: true },
  { isbn: '0136291554', inStock: false, isCheckedOut: false },
  { isbn: '0201633612', inStock: true, isCheckedOut: false },
];

export const resolvers: GraphQLResolverMap<any> = {
  Furniture: {
    __resolveReference(object) {
      return inventory.find(product => product.sku === object.sku);
    },
  },
  Book: {
    __resolveReference(object) {
      return inventory.find(product => product.isbn === object.isbn);
    },
  },
  User: {
    goodDescription(object) {
      return object.metadata[0].description === '2';
    },
  },
};
