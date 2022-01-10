import * as accounts from './accounts';
import * as books from './books';
import * as documents from './documents';
import * as inventory from './inventory';
import * as product from './product';
import * as reviews from './reviews';
import * as reviewsWithUpdate from './special-cases/reviewsWithUpdate';
import * as accountsWithoutTag from './special-cases/accountsWithoutTag';
import * as reviewsWithoutTag from './special-cases/reviewsWithoutTag';
import { DocumentNode } from 'graphql';
import { GraphQLResolverMap } from '../resolverMap';

export interface Fixture {
  name: string;
  url: string;
  typeDefs: DocumentNode;
  resolvers?: GraphQLResolverMap<any>
}

const fixtures: Fixture[] = [
  accounts,
  books,
  documents,
  inventory,
  product,
  reviews,
];

const fixturesWithUpdate = [
  accounts,
  books,
  documents,
  inventory,
  product,
  reviewsWithUpdate,
];

const fixturesWithoutTag = [
  accountsWithoutTag,
  books,
  documents,
  inventory,
  product,
  reviewsWithoutTag,
];

const fixtureNames = [
  accounts.name,
  product.name,
  inventory.name,
  reviews.name,
  books.name,
  documents.name,
];

export { superGraphWithInaccessible } from './special-cases/supergraphWithInaccessible';
export {
  accounts,
  books,
  documents,
  inventory,
  product,
  reviews,
  reviewsWithUpdate,
  fixtures,
  fixturesWithUpdate,
  fixturesWithoutTag,
  fixtureNames,
};
