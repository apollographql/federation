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
import * as dep1 from './multi-service-require-cases/dep1';
import * as dep2 from './multi-service-require-cases/dep2';
import * as xfield from './multi-service-require-cases/xfield';
import * as mainEntity from './multi-service-require-cases/mainEntity';
import * as dep1Ex from './multi-service-require-cases/dep1WithException';
import * as dep2Ex from './multi-service-require-cases/dep2WithException';

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
  dep1,
  dep2,
  dep1Ex,
  dep2Ex,
  xfield,
  mainEntity,
};
