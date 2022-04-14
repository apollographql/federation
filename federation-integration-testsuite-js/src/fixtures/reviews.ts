import { GraphQLResolverMap } from '../resolverMap';
import { fed2gql as gql } from '../utils/fed2gql';

export const name = 'reviews';
export const url = `https://${name}.api.com.invalid`;
export const typeDefs = gql`
  directive @stream on FIELD
  directive @transform(from: String!) on FIELD
  directive @tag(name: String!) repeatable on
    | INTERFACE
    | FIELD_DEFINITION
    | OBJECT
    | UNION
    | ARGUMENT_DEFINITION
    | SCALAR
    | ENUM
    | ENUM_VALUE
    | INPUT_OBJECT
    | INPUT_FIELD_DEFINITION

  type Query {
    topReviews(first: Int = 5): [Review]
  }

  type Review @key(fields: "id") {
    id: ID!
    body(format: Boolean = false): String
    author: User @provides(fields: "username")
    product: Product
    metadata: [MetadataOrError]
  }

  input UpdateReviewInput @tag(name: "from-reviews") {
    id: ID!
    body: String @tag(name: "from-reviews")
  }

  type UserMetadata {
    address: String @external
  }

  type User @key(fields: "id") @tag(name: "from-reviews") {
    id: ID!
    username: String @external
    reviews: [Review]
    numberOfReviews: Int!
    metadata: [UserMetadata] @external
    goodAddress: Boolean @requires(fields: "metadata { address }")
  }

  interface Product @tag(name: "from-reviews") {
    reviews: [Review] @tag(name: "from-reviews")
  }

  type Furniture implements Product @key(fields: "upc") {
    upc: String!
    reviews: [Review]
  }

  type Book implements Product @key(fields: "isbn") {
    isbn: String!
    reviews: [Review]
    similarBooks: [Book]! @external
    relatedReviews: [Review!]! @requires(fields: "similarBooks { isbn }")
  }

  interface Vehicle {
    retailPrice: String
  }

  type Car implements Vehicle @key(fields: "id") {
    id: String!
    price: String @external
    retailPrice: String @requires(fields: "price")
  }

  type Van implements Vehicle @key(fields: "id") {
    id: String!
    price: String @external
    retailPrice: String @requires(fields: "price")
  }

  input ReviewProduct {
    upc: String!
    body: String!
    stars: Int @deprecated(reason: "Stars are no longer in use")
  }

  type Mutation {
    reviewProduct(input: ReviewProduct!): Product
    updateReview(review: UpdateReviewInput! @tag(name: "from-reviews")): Review
    deleteReview(id: ID!): Boolean
  }

  # Value type
  type KeyValue @shareable @tag(name: "from-reviews") {
    key: String! @tag(name: "from-reviews")
    value: String!
  }

  # Value type
  type Error @shareable {
    code: Int
    message: String
  }

  # Value type
  union MetadataOrError = KeyValue | Error
`;

const usernames = [
  { id: '1', username: '@ada' },
  { id: '2', username: '@complete' },
];
const reviews = [
  {
    id: '1',
    authorID: '1',
    product: { __typename: 'Furniture', upc: '1' },
    body: 'Love it!',
    metadata: [{ code: 418, message: "I'm a teapot" }],
  },
  {
    id: '2',
    authorID: '1',
    product: { __typename: 'Furniture', upc: '2' },
    body: 'Too expensive.',
  },
  {
    id: '3',
    authorID: '2',
    product: { __typename: 'Furniture', upc: '3' },
    body: 'Could be better.',
  },
  {
    id: '4',
    authorID: '2',
    product: { __typename: 'Furniture', upc: '1' },
    body: 'Prefer something else.',
  },
  {
    id: '4',
    authorID: '2',
    product: { __typename: 'Book', isbn: '0262510871' },
    body: 'Wish I had read this before.',
  },
  {
    id: '5',
    authorID: '2',
    product: { __typename: 'Book', isbn: '0136291554' },
    body: 'A bit outdated.',
    metadata: [{ key: 'likes', value: '5' }],
  },
  {
    id: '6',
    authorID: '1',
    product: { __typename: 'Book', isbn: '0201633612' },
    body: 'A classic.',
  },
];

export const resolvers: GraphQLResolverMap<unknown> = {
  Query: {
    review(_, args) {
      return { id: args.id };
    },
    topReviews(_, args) {
      return reviews.slice(0, args.first);
    },
  },
  Mutation: {
    reviewProduct(_, { input: { upc, body } }) {
      const id = `${Number(reviews[reviews.length - 1].id) + 1}`;
      reviews.push({
        id,
        authorID: '1',
        product: { __typename: 'Furniture', upc },
        body,
      });
      return { upc, __typename: 'Furniture' };
    },
    updateReview(_, { review: { id }, review: updatedReview }) {
      let review = reviews.find((review) => review.id === id);

      if (!review) {
        return null;
      }

      review = {
        ...review,
        ...updatedReview,
      };

      return review;
    },
    deleteReview(_, { id }) {
      const deleted = reviews.splice(
        reviews.findIndex((review) => review.id === id),
        1,
      );
      return Boolean(deleted);
    },
  },
  Review: {
    author(review) {
      return { __typename: 'User', id: review.authorID };
    },
  },
  User: {
    reviews(user) {
      return reviews.filter((review) => review.authorID === user.id);
    },
    numberOfReviews(user) {
      return reviews.filter((review) => review.authorID === user.id).length;
    },
    username(user) {
      const found = usernames.find((username) => username.id === user.id);
      return found ? found.username : null;
    },
    goodAddress(object) {
      return object.metadata[0].address === '1';
    },
  },
  Furniture: {
    reviews(product) {
      return reviews.filter((review) => review.product.upc === product.upc);
    },
  },
  Book: {
    reviews(product) {
      return reviews.filter((review) => review.product.isbn === product.isbn);
    },
    relatedReviews(book) {
      return book.similarBooks
        ? book.similarBooks
            .map(({ isbn }: any) =>
              reviews.filter((review) => review.product.isbn === isbn),
            )
            .flat()
        : [];
    },
  },
  Car: {
    retailPrice(car) {
      return car.price;
    },
  },
  Van: {
    retailPrice(van) {
      return van.price;
    },
  },
  MetadataOrError: {
    __resolveType(object) {
      return 'key' in object ? 'KeyValue' : 'Error';
    },
  },
};
