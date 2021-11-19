import { loadSupergraphSdlFromStorage } from '../loadSupergraphSdlFromStorage';
import { getDefaultFetcher } from '../..';
import {
  graphRef,
  apiKey,
  mockCloudConfigUrl,
  mockSupergraphSdlRequest,
  mockOutOfBandReporterUrl,
  mockOutOfBandReportRequestSuccess,
  mockSupergraphSdlRequestSuccess,
  mockSupergraphSdlRequestIfAfterUnchanged,
} from './integration/nockMocks';
import mockedEnv from 'mocked-env';

describe('loadSupergraphSdlFromStorage', () => {
  let cleanUp: (() => void) | null = null;

  afterAll(async () => {
    if (cleanUp) {
      cleanUp();
      cleanUp = null;
    }
  });

  it('fetches Supergraph SDL as expected', async () => {
    mockSupergraphSdlRequestSuccess();

    const fetcher = getDefaultFetcher();
    const result = await loadSupergraphSdlFromStorage({
      graphRef,
      apiKey,
      endpoint: mockCloudConfigUrl,
      fetcher,
      compositionId: null,

    });

    expect(result).toMatchInlineSnapshot(`
      Object {
        "id": "originalId-1234",
        "supergraphSdl": "schema
        @core(feature: \\"https://specs.apollo.dev/core/v0.2\\")
        @core(feature: \\"https://specs.apollo.dev/join/v0.2\\", for: EXECUTION)
        @core(feature: \\"https://specs.apollo.dev/tag/v0.1\\")
      {
        query: Query
        mutation: Mutation
      }

      directive @core(feature: String!, as: String, for: core__Purpose) repeatable on SCHEMA

      directive @join__field(graph: join__Graph!, requires: join__FieldSet, provides: join__FieldSet, type: String, external: Boolean) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @join__implements(graph: join__Graph!, interface: String!) repeatable on OBJECT | INTERFACE

      directive @join__type(graph: join__Graph!, key: join__FieldSet, extension: Boolean! = false) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

      directive @stream on FIELD

      directive @tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

      directive @transform(from: String!) on FIELD

      union AccountType
        @join__type(graph: ACCOUNTS)
        @tag(name: \\"from-accounts\\")
       = PasswordAccount | SMSAccount

      type Amazon
        @join__type(graph: PRODUCT)
      {
        referrer: String
      }

      union Body
        @join__type(graph: DOCUMENTS)
       = Image | Text

      type Book implements Product
        @join__implements(graph: INVENTORY, interface: \\"Product\\")
        @join__implements(graph: PRODUCT, interface: \\"Product\\")
        @join__implements(graph: REVIEWS, interface: \\"Product\\")
        @join__type(graph: BOOKS, key: \\"isbn\\")
        @join__type(graph: INVENTORY, key: \\"isbn\\", extension: true)
        @join__type(graph: PRODUCT, key: \\"isbn\\", extension: true)
        @join__type(graph: REVIEWS, key: \\"isbn\\", extension: true)
      {
        isbn: String!
        title: String @join__field(graph: BOOKS) @join__field(graph: PRODUCT, external: true)
        year: Int @join__field(graph: BOOKS) @join__field(graph: PRODUCT, external: true)
        similarBooks: [Book]! @join__field(graph: BOOKS) @join__field(graph: REVIEWS, external: true)
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

      union Brand
        @join__type(graph: PRODUCT)
       = Ikea | Amazon

      enum CacheControlScope
        @join__type(graph: ACCOUNTS)
        @join__type(graph: BOOKS)
        @join__type(graph: PRODUCT)
      {
        PUBLIC
        PRIVATE
      }

      type Car implements Vehicle
        @join__implements(graph: PRODUCT, interface: \\"Vehicle\\")
        @join__implements(graph: REVIEWS, interface: \\"Vehicle\\")
        @join__type(graph: PRODUCT, key: \\"id\\")
        @join__type(graph: REVIEWS, key: \\"id\\", extension: true)
      {
        id: String!
        description: String @join__field(graph: PRODUCT)
        price: String @join__field(graph: PRODUCT) @join__field(graph: REVIEWS, external: true)
        retailPrice: String @join__field(graph: REVIEWS, requires: \\"price\\")
      }

      enum core__Purpose {
        \\"\\"\\"
        \`SECURITY\` features provide metadata necessary to securely resolve fields.
        \\"\\"\\"
        SECURITY

        \\"\\"\\"
        \`EXECUTION\` features provide metadata necessary for operation execution.
        \\"\\"\\"
        EXECUTION
      }

      type Error
        @join__type(graph: BOOKS)
        @join__type(graph: PRODUCT)
        @join__type(graph: REVIEWS)
      {
        code: Int
        message: String
      }

      type Furniture implements Product
        @join__implements(graph: INVENTORY, interface: \\"Product\\")
        @join__implements(graph: PRODUCT, interface: \\"Product\\")
        @join__implements(graph: REVIEWS, interface: \\"Product\\")
        @join__type(graph: INVENTORY, key: \\"sku\\", extension: true)
        @join__type(graph: PRODUCT, key: \\"upc\\")
        @join__type(graph: PRODUCT, key: \\"sku\\")
        @join__type(graph: REVIEWS, key: \\"upc\\", extension: true)
      {
        sku: String! @join__field(graph: INVENTORY) @join__field(graph: PRODUCT)
        inStock: Boolean @join__field(graph: INVENTORY)
        isHeavy: Boolean @join__field(graph: INVENTORY)
        upc: String! @join__field(graph: PRODUCT) @join__field(graph: REVIEWS)
        name: String @join__field(graph: PRODUCT)
        price: String @join__field(graph: PRODUCT)
        brand: Brand @join__field(graph: PRODUCT)
        metadata: [MetadataOrError] @join__field(graph: PRODUCT)
        details: ProductDetailsFurniture @join__field(graph: PRODUCT)
        reviews: [Review] @join__field(graph: REVIEWS)
      }

      type Ikea
        @join__type(graph: PRODUCT)
      {
        asile: Int
      }

      type Image implements NamedObject
        @join__implements(graph: DOCUMENTS, interface: \\"NamedObject\\")
        @join__type(graph: DOCUMENTS)
      {
        name: String!
        attributes: ImageAttributes!
      }

      type ImageAttributes
        @join__type(graph: DOCUMENTS)
      {
        url: String!
      }

      scalar join__FieldSet

      enum join__Graph {
        ACCOUNTS @join__graph(name: \\"accounts\\", url: \\"https://accounts.api.com.invalid\\")
        BOOKS @join__graph(name: \\"books\\", url: \\"https://books.api.com.invalid\\")
        DOCUMENTS @join__graph(name: \\"documents\\", url: \\"https://documents.api.com.invalid\\")
        INVENTORY @join__graph(name: \\"inventory\\", url: \\"https://inventory.api.com.invalid\\")
        PRODUCT @join__graph(name: \\"product\\", url: \\"https://product.api.com.invalid\\")
        REVIEWS @join__graph(name: \\"reviews\\", url: \\"https://reviews.api.com.invalid\\")
      }

      scalar JSON
        @join__type(graph: ACCOUNTS)
        @specifiedBy(url: \\"https://json-spec.dev\\")

      type KeyValue
        @join__type(graph: BOOKS)
        @join__type(graph: PRODUCT)
        @join__type(graph: REVIEWS)
      {
        key: String!
        value: String!
      }

      type Library
        @join__type(graph: ACCOUNTS, key: \\"id\\", extension: true)
        @join__type(graph: BOOKS, key: \\"id\\")
      {
        id: ID!
        name: String @join__field(graph: ACCOUNTS, external: true) @join__field(graph: BOOKS)
        userAccount(id: ID! = 1): User @join__field(graph: ACCOUNTS, requires: \\"name\\")
      }

      union MetadataOrError
        @join__type(graph: BOOKS)
        @join__type(graph: PRODUCT)
        @join__type(graph: REVIEWS)
       = KeyValue | Error

      type Mutation
        @join__type(graph: ACCOUNTS)
        @join__type(graph: REVIEWS)
      {
        login(username: String!, password: String!, userId: String @deprecated(reason: \\"Use username instead\\")): User @join__field(graph: ACCOUNTS)
        reviewProduct(input: ReviewProduct!): Product @join__field(graph: REVIEWS)
        updateReview(review: UpdateReviewInput!): Review @join__field(graph: REVIEWS)
        deleteReview(id: ID!): Boolean @join__field(graph: REVIEWS)
      }

      type Name
        @join__type(graph: ACCOUNTS)
      {
        first: String
        last: String
      }

      interface NamedObject
        @join__type(graph: DOCUMENTS)
      {
        name: String!
      }

      type PasswordAccount
        @join__type(graph: ACCOUNTS, key: \\"email\\")
      {
        email: String!
      }

      interface Product
        @join__type(graph: INVENTORY)
        @join__type(graph: PRODUCT)
        @join__type(graph: REVIEWS)
        @tag(name: \\"from-reviews\\")
      {
        inStock: Boolean @join__field(graph: INVENTORY)
        upc: String! @join__field(graph: PRODUCT)
        sku: String! @join__field(graph: PRODUCT)
        name: String @join__field(graph: PRODUCT)
        price: String @join__field(graph: PRODUCT)
        details: ProductDetails @join__field(graph: PRODUCT)
        reviews: [Review] @join__field(graph: REVIEWS)
      }

      interface ProductDetails
        @join__type(graph: PRODUCT)
      {
        country: String
      }

      type ProductDetailsBook implements ProductDetails
        @join__implements(graph: PRODUCT, interface: \\"ProductDetails\\")
        @join__type(graph: PRODUCT)
      {
        country: String
        pages: Int
      }

      type ProductDetailsFurniture implements ProductDetails
        @join__implements(graph: PRODUCT, interface: \\"ProductDetails\\")
        @join__type(graph: PRODUCT)
      {
        country: String
        color: String
      }

      type Query
        @join__type(graph: ACCOUNTS)
        @join__type(graph: BOOKS)
        @join__type(graph: DOCUMENTS)
        @join__type(graph: INVENTORY)
        @join__type(graph: PRODUCT)
        @join__type(graph: REVIEWS)
      {
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
        @join__type(graph: REVIEWS, key: \\"id\\")
      {
        id: ID!
        body(format: Boolean = false): String
        author: User @join__field(graph: REVIEWS, provides: \\"username\\")
        product: Product
        metadata: [MetadataOrError]
      }

      input ReviewProduct
        @join__type(graph: REVIEWS)
      {
        upc: String!
        body: String!
        stars: Int @deprecated(reason: \\"Stars are no longer in use\\")
      }

      type SMSAccount
        @join__type(graph: ACCOUNTS, key: \\"number\\")
      {
        number: String
      }

      type Text implements NamedObject
        @join__implements(graph: DOCUMENTS, interface: \\"NamedObject\\")
        @join__type(graph: DOCUMENTS)
      {
        name: String!
        attributes: TextAttributes!
      }

      type TextAttributes
        @join__type(graph: DOCUMENTS)
      {
        bold: Boolean
        text: String
      }

      union Thing
        @join__type(graph: PRODUCT)
       = Car | Ikea

      input UpdateReviewInput
        @join__type(graph: REVIEWS)
      {
        id: ID!
        body: String
      }

      type User
        @join__type(graph: ACCOUNTS, key: \\"id\\")
        @join__type(graph: ACCOUNTS, key: \\"username name { first last }\\")
        @join__type(graph: INVENTORY, key: \\"id\\", extension: true)
        @join__type(graph: PRODUCT, key: \\"id\\", extension: true)
        @join__type(graph: REVIEWS, key: \\"id\\", extension: true)
        @tag(name: \\"from-accounts\\")
        @tag(name: \\"from-reviews\\")
      {
        id: ID! @tag(name: \\"accounts\\")
        name: Name @join__field(graph: ACCOUNTS)
        username: String @join__field(graph: ACCOUNTS) @join__field(graph: REVIEWS, external: true)
        birthDate(locale: String): String @tag(name: \\"admin\\") @tag(name: \\"dev\\") @join__field(graph: ACCOUNTS)
        account: AccountType @join__field(graph: ACCOUNTS)
        metadata: [UserMetadata] @join__field(graph: ACCOUNTS) @join__field(graph: INVENTORY, external: true) @join__field(graph: REVIEWS, external: true)
        ssn: String @join__field(graph: ACCOUNTS)
        goodDescription: Boolean @join__field(graph: INVENTORY, requires: \\"metadata { description }\\")
        vehicle: Vehicle @join__field(graph: PRODUCT)
        thing: Thing @join__field(graph: PRODUCT)
        reviews: [Review] @join__field(graph: REVIEWS)
        numberOfReviews: Int! @join__field(graph: REVIEWS)
        goodAddress: Boolean @join__field(graph: REVIEWS, requires: \\"metadata { address }\\")
      }

      type UserMetadata
        @join__type(graph: ACCOUNTS)
        @join__type(graph: INVENTORY)
        @join__type(graph: REVIEWS)
      {
        name: String @join__field(graph: ACCOUNTS)
        address: String @join__field(graph: ACCOUNTS) @join__field(graph: REVIEWS, external: true)
        description: String @join__field(graph: ACCOUNTS) @join__field(graph: INVENTORY, external: true)
      }

      type Van implements Vehicle
        @join__implements(graph: PRODUCT, interface: \\"Vehicle\\")
        @join__implements(graph: REVIEWS, interface: \\"Vehicle\\")
        @join__type(graph: PRODUCT, key: \\"id\\")
        @join__type(graph: REVIEWS, key: \\"id\\", extension: true)
      {
        id: String!
        description: String @join__field(graph: PRODUCT)
        price: String @join__field(graph: PRODUCT) @join__field(graph: REVIEWS, external: true)
        retailPrice: String @join__field(graph: REVIEWS, requires: \\"price\\")
      }

      interface Vehicle
        @join__type(graph: PRODUCT)
        @join__type(graph: REVIEWS)
      {
        id: String! @join__field(graph: PRODUCT)
        description: String @join__field(graph: PRODUCT)
        price: String @join__field(graph: PRODUCT)
        retailPrice: String @join__field(graph: REVIEWS)
      }",
      }
    `);
  });

  describe('errors', () => {
    it('throws on a malformed response', async () => {
      mockSupergraphSdlRequest().reply(200, 'Invalid JSON');

      const fetcher = getDefaultFetcher();
      await expect(
        loadSupergraphSdlFromStorage({
          graphRef,
          apiKey,
          endpoint: mockCloudConfigUrl,
          fetcher,
          compositionId: null,

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
          graphRef,
          apiKey,
          endpoint: mockCloudConfigUrl,
          fetcher,
          compositionId: null,
        }),
      ).rejects.toThrowError(message);
    });

    it("throws on non-OK status codes when `errors` isn't present in a JSON response", async () => {
      mockSupergraphSdlRequest().reply(500);

      const fetcher = getDefaultFetcher();
      await expect(
        loadSupergraphSdlFromStorage({
          graphRef,
          apiKey,
          endpoint: mockCloudConfigUrl,
          fetcher,
          compositionId: null,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"An error occurred while fetching your schema from Apollo: 500 Internal Server Error"`,
      );
    });

    // if an additional request were made by the out of band reporter, nock would throw since it's unmocked
    // and this test would fail
    it("Out of band reporting doesn't submit reports when endpoint is not configured", async () => {
      mockSupergraphSdlRequest().reply(400);

      const fetcher = getDefaultFetcher();
      await expect(
        loadSupergraphSdlFromStorage({
          graphRef,
          apiKey,
          endpoint: mockCloudConfigUrl,
          fetcher,
          compositionId: null,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"An error occurred while fetching your schema from Apollo: 400 invalid json response body at https://example.cloud-config-url.com/cloudconfig/ reason: Unexpected end of JSON input"`,
      );
    });

    it('throws on 400 status response and successfully submits an out of band error', async () => {
      cleanUp = mockedEnv({
        APOLLO_OUT_OF_BAND_REPORTER_ENDPOINT: mockOutOfBandReporterUrl,
      });

      mockSupergraphSdlRequest().reply(400);
      mockOutOfBandReportRequestSuccess();

      const fetcher = getDefaultFetcher();
      await expect(
        loadSupergraphSdlFromStorage({
          graphRef,
          apiKey,
          endpoint: mockCloudConfigUrl,
          fetcher,
          compositionId: null,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"An error occurred while fetching your schema from Apollo: 400 invalid json response body at https://example.cloud-config-url.com/cloudconfig/ reason: Unexpected end of JSON input"`,
      );
    });

    it('throws on 413 status response and successfully submits an out of band error', async () => {
      cleanUp = mockedEnv({
        APOLLO_OUT_OF_BAND_REPORTER_ENDPOINT: mockOutOfBandReporterUrl,
      });

      mockSupergraphSdlRequest().reply(413);
      mockOutOfBandReportRequestSuccess();

      const fetcher = getDefaultFetcher();
      await expect(
        loadSupergraphSdlFromStorage({
          graphRef,
          apiKey,
          endpoint: mockCloudConfigUrl,
          fetcher,
          compositionId: null,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"An error occurred while fetching your schema from Apollo: 413 Payload Too Large"`,
      );
    });

    it('throws on 422 status response and successfully submits an out of band error', async () => {
      cleanUp = mockedEnv({
        APOLLO_OUT_OF_BAND_REPORTER_ENDPOINT: mockOutOfBandReporterUrl,
      });

      mockSupergraphSdlRequest().reply(422);
      mockOutOfBandReportRequestSuccess();

      const fetcher = getDefaultFetcher();
      await expect(
        loadSupergraphSdlFromStorage({
          graphRef,
          apiKey,
          endpoint: mockCloudConfigUrl,
          fetcher,
          compositionId: null,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"An error occurred while fetching your schema from Apollo: 422 Unprocessable Entity"`,
      );
    });

    it('throws on 408 status response and successfully submits an out of band error', async () => {
      cleanUp = mockedEnv({
        APOLLO_OUT_OF_BAND_REPORTER_ENDPOINT: mockOutOfBandReporterUrl,
      });

      mockSupergraphSdlRequest().reply(408);
      mockOutOfBandReportRequestSuccess();

      const fetcher = getDefaultFetcher();
      await expect(
        loadSupergraphSdlFromStorage({
          graphRef,
          apiKey,
          endpoint: mockCloudConfigUrl,
          fetcher,
          compositionId: null,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"An error occurred while fetching your schema from Apollo: 408 Request Timeout"`,
      );
    });
  });

  it('throws on 504 status response and successfully submits an out of band error', async () => {
    cleanUp = mockedEnv({
      APOLLO_OUT_OF_BAND_REPORTER_ENDPOINT: mockOutOfBandReporterUrl,
    });

    mockSupergraphSdlRequest().reply(504);
    mockOutOfBandReportRequestSuccess();

    const fetcher = getDefaultFetcher();
    await expect(
      loadSupergraphSdlFromStorage({
        graphRef,
        apiKey,
        endpoint: mockCloudConfigUrl,
        fetcher,
        compositionId: null,
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `"An error occurred while fetching your schema from Apollo: 504 Gateway Timeout"`,
    );
  });

  it('throws when there is no response and successfully submits an out of band error', async () => {
    cleanUp = mockedEnv({
      APOLLO_OUT_OF_BAND_REPORTER_ENDPOINT: mockOutOfBandReporterUrl,
    });

    mockSupergraphSdlRequest().replyWithError('no response');
    mockOutOfBandReportRequestSuccess();

    const fetcher = getDefaultFetcher();
    await expect(
      loadSupergraphSdlFromStorage({
        graphRef,
        apiKey,
        endpoint: mockCloudConfigUrl,
        fetcher,
        compositionId: null,
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `"An error occurred while fetching your schema from Apollo: request to https://example.cloud-config-url.com/cloudconfig/ failed, reason: no response"`,
    );
  });

  it('throws on 502 status response and successfully submits an out of band error', async () => {
    cleanUp = mockedEnv({
      APOLLO_OUT_OF_BAND_REPORTER_ENDPOINT: mockOutOfBandReporterUrl,
    });

    mockSupergraphSdlRequest().reply(502);
    mockOutOfBandReportRequestSuccess();

    const fetcher = getDefaultFetcher();
    await expect(
      loadSupergraphSdlFromStorage({
        graphRef,
        apiKey,
        endpoint: mockCloudConfigUrl,
        fetcher,
        compositionId: null,
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `"An error occurred while fetching your schema from Apollo: 502 Bad Gateway"`,
    );
  });

  it('throws on 503 status response and successfully submits an out of band error', async () => {
    cleanUp = mockedEnv({
      APOLLO_OUT_OF_BAND_REPORTER_ENDPOINT: mockOutOfBandReporterUrl,
    });

    mockSupergraphSdlRequest().reply(503);
    mockOutOfBandReportRequestSuccess();

    const fetcher = getDefaultFetcher();
    await expect(
      loadSupergraphSdlFromStorage({
        graphRef,
        apiKey,
        endpoint: mockCloudConfigUrl,
        fetcher,
        compositionId: null,
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `"An error occurred while fetching your schema from Apollo: 503 Service Unavailable"`,
    );
  });

  it('successfully responds to SDL unchanged by returning null', async () => {
    mockSupergraphSdlRequestIfAfterUnchanged("id-1234");

    const fetcher = getDefaultFetcher();
    const result = await loadSupergraphSdlFromStorage({
        graphRef,
        apiKey,
        endpoint: mockCloudConfigUrl,
        fetcher,
        compositionId: "id-1234",
    });
    expect(result).toBeNull();
  });
});
