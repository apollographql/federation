import { loadSupergraphSdlFromStorage } from '../loadSupergraphSdlFromStorage';
import { getDefaultFetcher } from '../..';
import {
  mockSupergraphSdlRequestSuccess,
  graphId,
  graphVariant,
  apiKey,
  mockCloudConfigUrl,
  mockSupergraphSdlRequest,
} from './integration/nockMocks';

describe('loadSupergraphSdlFromStorage', () => {
  it('fetches Supergraph SDL as expected', async () => {
    mockSupergraphSdlRequestSuccess();
    const fetcher = getDefaultFetcher();
    const result = await loadSupergraphSdlFromStorage({
      graphId,
      graphVariant,
      apiKey,
      endpoint: mockCloudConfigUrl,
      fetcher,
    });

    expect(result).toMatchInlineSnapshot(`
      Object {
        "id": "originalId-1234",
        "supergraphSdl": "schema
        @core(feature: \\"https://specs.apollo.dev/core/v0.1\\"),
        @core(feature: \\"https://specs.apollo.dev/join/v0.1\\")
      {
        query: Query
        mutation: Mutation
      }

      directive @core(feature: String!) repeatable on SCHEMA

      directive @join__field(graph: join__Graph, requires: join__FieldSet, provides: join__FieldSet) on FIELD_DEFINITION

      directive @join__type(graph: join__Graph!, key: join__FieldSet) repeatable on OBJECT | INTERFACE

      directive @join__owner(graph: join__Graph!) on OBJECT | INTERFACE

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @internal on OBJECT | FIELD_DEFINITION

      directive @stream on FIELD

      directive @transform(from: String!) on FIELD

      union AccountType = PasswordAccount | SMSAccount

      type Amazon {
        referrer: String
      }

      union Body = Image | Text

      type Book implements Product
        @join__owner(graph: BOOKS)
        @join__type(graph: BOOKS, key: \\"isbn\\")
        @join__type(graph: INVENTORY, key: \\"isbn\\")
        @join__type(graph: PRODUCT, key: \\"isbn\\")
        @join__type(graph: REVIEWS, key: \\"isbn\\")
      {
        isbn: String! @join__field(graph: BOOKS)
        title: String @join__field(graph: BOOKS)
        year: Int @join__field(graph: BOOKS)
        similarBooks: [Book]! @join__field(graph: BOOKS)
        metadata: [MetadataOrError] @join__field(graph: BOOKS)
        inStock: Boolean @join__field(graph: INVENTORY)
        isCheckedOut: Boolean @join__field(graph: INVENTORY)
        upc: String! @join__field(graph: PRODUCT)
        sku: String! @join__field(graph: PRODUCT)
        name(delimeter: String = \\" \\"): String @join__field(graph: PRODUCT, requires: \\"title year\\")
        price: String @join__field(graph: PRODUCT)
        details: ProductDetailsBook @join__field(graph: PRODUCT)
        reviews: [Review] @join__field(graph: REVIEWS)
        relatedReviews: [Review!]! @join__field(graph: REVIEWS, requires: \\"similarBooks { isbn }\\")
      }

      union Brand = Ikea | Amazon

      type Car implements Vehicle
        @join__owner(graph: PRODUCT)
        @join__type(graph: PRODUCT, key: \\"id\\")
        @join__type(graph: REVIEWS, key: \\"id\\")
      {
        id: String! @join__field(graph: PRODUCT)
        description: String @join__field(graph: PRODUCT)
        price: String @join__field(graph: PRODUCT)
        retailPrice: String @join__field(graph: REVIEWS, requires: \\"price\\")
      }

      type Error {
        code: Int
        message: String
      }

      type Furniture implements Product
        @join__owner(graph: PRODUCT)
        @join__type(graph: PRODUCT, key: \\"upc\\")
        @join__type(graph: PRODUCT, key: \\"sku\\")
        @join__type(graph: INVENTORY, key: \\"sku\\")
        @join__type(graph: REVIEWS, key: \\"upc\\")
      {
        upc: String! @join__field(graph: PRODUCT)
        sku: String! @join__field(graph: PRODUCT)
        name: String @join__field(graph: PRODUCT)
        price: String @join__field(graph: PRODUCT)
        brand: Brand @join__field(graph: PRODUCT)
        metadata: [MetadataOrError] @join__field(graph: PRODUCT)
        details: ProductDetailsFurniture @join__field(graph: PRODUCT)
        inStock: Boolean @join__field(graph: INVENTORY)
        isHeavy: Boolean @join__field(graph: INVENTORY)
        reviews: [Review] @join__field(graph: REVIEWS)
      }

      type Ikea {
        asile: Int
      }

      type Image {
        name: String!
        attributes: ImageAttributes!
      }

      type ImageAttributes {
        url: String!
      }

      scalar join__FieldSet

      enum join__Graph {
        ACCOUNTS @join__graph(name: \\"accounts\\" url: \\"https://accounts.api.com\\")
        BOOKS @join__graph(name: \\"books\\" url: \\"https://books.api.com\\")
        DOCUMENTS @join__graph(name: \\"documents\\" url: \\"https://documents.api.com\\")
        INVENTORY @join__graph(name: \\"inventory\\" url: \\"https://inventory.api.com\\")
        PRODUCT @join__graph(name: \\"product\\" url: \\"https://product.api.com\\")
        REVIEWS @join__graph(name: \\"reviews\\" url: \\"https://reviews.api.com\\")
      }

      type KeyValue {
        key: String!
        value: String!
      }

      type Library
        @join__owner(graph: BOOKS)
        @join__type(graph: BOOKS, key: \\"id\\")
        @join__type(graph: ACCOUNTS, key: \\"id\\")
      {
        id: ID! @join__field(graph: BOOKS)
        name: String @join__field(graph: BOOKS)
        userAccount(id: ID! = 1): User @join__field(graph: ACCOUNTS, requires: \\"name\\")
      }

      union MetadataOrError = KeyValue | Error

      type Mutation {
        login(username: String!, password: String!): User @join__field(graph: ACCOUNTS)
        reviewProduct(upc: String!, body: String!): Product @join__field(graph: REVIEWS)
        updateReview(review: UpdateReviewInput!): Review @join__field(graph: REVIEWS)
        deleteReview(id: ID!): Boolean @join__field(graph: REVIEWS)
      }

      type Name {
        first: String
        last: String
      }

      type PasswordAccount
        @join__owner(graph: ACCOUNTS)
        @join__type(graph: ACCOUNTS, key: \\"email\\")
      {
        email: String! @join__field(graph: ACCOUNTS)
      }

      interface Product {
        upc: String!
        sku: String!
        name: String
        price: String
        details: ProductDetails
        inStock: Boolean
        reviews: [Review]
      }

      interface ProductDetails {
        country: String
      }

      type ProductDetailsBook implements ProductDetails {
        country: String
        pages: Int
      }

      type ProductDetailsFurniture implements ProductDetails {
        country: String
        color: String
      }

      type Query {
        user(id: ID!): User @join__field(graph: ACCOUNTS)
        me: User @join__field(graph: ACCOUNTS)
        book(isbn: String!): Book @join__field(graph: BOOKS)
        books: [Book] @join__field(graph: BOOKS)
        library(id: ID!): Library @join__field(graph: BOOKS)
        body: Body! @join__field(graph: DOCUMENTS)
        product(upc: String!): Product @join__field(graph: PRODUCT)
        vehicle(id: String!): Vehicle @join__field(graph: PRODUCT)
        topProducts(first: Int = 5): [Product] @join__field(graph: PRODUCT)
        topCars(first: Int = 5): [Car] @join__field(graph: PRODUCT)
        topReviews(first: Int = 5): [Review] @join__field(graph: REVIEWS)
      }

      type Review
        @join__owner(graph: REVIEWS)
        @join__type(graph: REVIEWS, key: \\"id\\")
      {
        id: ID! @join__field(graph: REVIEWS)
        body(format: Boolean = false): String @join__field(graph: REVIEWS)
        author: User @join__field(graph: REVIEWS, provides: \\"username\\")
        product: Product @join__field(graph: REVIEWS)
        metadata: [MetadataOrError] @join__field(graph: REVIEWS)
      }

      type SMSAccount
        @join__owner(graph: ACCOUNTS)
        @join__type(graph: ACCOUNTS, key: \\"number\\")
      {
        number: String @join__field(graph: ACCOUNTS)
      }

      type Text {
        name: String!
        attributes: TextAttributes!
      }

      type TextAttributes {
        bold: Boolean
        text: String
      }

      union Thing = Car | Ikea

      input UpdateReviewInput {
        id: ID!
        body: String
      }

      type User
        @join__owner(graph: ACCOUNTS)
        @join__type(graph: ACCOUNTS, key: \\"id\\")
        @join__type(graph: ACCOUNTS, key: \\"username name { first last }\\")
        @join__type(graph: INVENTORY, key: \\"id\\")
        @join__type(graph: PRODUCT, key: \\"id\\")
        @join__type(graph: REVIEWS, key: \\"id\\")
      {
        id: ID! @join__field(graph: ACCOUNTS)
        name: Name @join__field(graph: ACCOUNTS)
        username: String @join__field(graph: ACCOUNTS)
        birthDate(locale: String): String @join__field(graph: ACCOUNTS)
        account: AccountType @join__field(graph: ACCOUNTS)
        metadata: [UserMetadata] @join__field(graph: ACCOUNTS)
        goodDescription: Boolean @join__field(graph: INVENTORY, requires: \\"metadata { description }\\")
        vehicle: Vehicle @join__field(graph: PRODUCT)
        thing: Thing @join__field(graph: PRODUCT)
        reviews: [Review] @join__field(graph: REVIEWS)
        numberOfReviews: Int! @join__field(graph: REVIEWS)
        goodAddress: Boolean @join__field(graph: REVIEWS, requires: \\"metadata { address }\\")
      }

      type UserMetadata {
        name: String
        address: String
        description: String
      }

      type Van implements Vehicle
        @join__owner(graph: PRODUCT)
        @join__type(graph: PRODUCT, key: \\"id\\")
        @join__type(graph: REVIEWS, key: \\"id\\")
      {
        id: String! @join__field(graph: PRODUCT)
        description: String @join__field(graph: PRODUCT)
        price: String @join__field(graph: PRODUCT)
        retailPrice: String @join__field(graph: REVIEWS, requires: \\"price\\")
      }

      interface Vehicle {
        id: String!
        description: String
        price: String
        retailPrice: String
      }
      ",
      }
    `);
  });

  describe('errors', () => {
    it('throws on a malformed response', async () => {
      mockSupergraphSdlRequest().reply(200, 'Invalid JSON');

      const fetcher = getDefaultFetcher();
      await expect(
        loadSupergraphSdlFromStorage({
          graphId,
          graphVariant,
          apiKey,
          endpoint: mockCloudConfigUrl,
          fetcher,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"An error occurred while fetching your schema from Apollo: 200 invalid json response body at https://example.cloud-config-url.com/cloudconfig/ reason: Unexpected token I in JSON at position 0"`,
      );
    });

    it('throws errors from JSON on 400', async () => {
      const message = 'Query syntax error';
      mockSupergraphSdlRequest().reply(
        400,
        JSON.stringify({
          errors: [{ message }],
        }),
      );

      const fetcher = getDefaultFetcher();
      await expect(
        loadSupergraphSdlFromStorage({
          graphId,
          graphVariant,
          apiKey,
          endpoint: mockCloudConfigUrl,
          fetcher,
        }),
      ).rejects.toThrowError(message);
    });

    it("throws on non-OK status codes when `errors` isn't present in a JSON response", async () => {
      mockSupergraphSdlRequest().reply(500);

      const fetcher = getDefaultFetcher();
      await expect(
        loadSupergraphSdlFromStorage({
          graphId,
          graphVariant,
          apiKey,
          endpoint: mockCloudConfigUrl,
          fetcher,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"An error occurred while fetching your schema from Apollo: 500 Internal Server Error"`,
      );
    });
  });
});
