import gql from 'graphql-tag';
import { execute } from '../execution-utils';
import {
  astSerializer,
  queryPlanSerializer,
} from 'apollo-federation-integration-testsuite';
import { fixtures } from 'apollo-federation-integration-testsuite';

expect.addSnapshotSerializer(astSerializer);
expect.addSnapshotSerializer(queryPlanSerializer);

describe('custom executable directives', () => {
  it('successfully passes directives along in requests to an underlying service', async () => {
    const query = `#graphql
      query GetReviewers {
        topReviews {
          body @stream
        }
      }
    `;

    const { errors, queryPlan } = await execute({
      query,
    });

    expect(errors).toBeUndefined();
    expect(queryPlan).toCallService('reviews');
    expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Fetch(service: "reviews") {
            {
              topReviews {
                body @stream
              }
            }
          },
        }
      `);
  });

  it('successfully passes directives and their variables along in requests to underlying services', async () => {
    const query = `#graphql
      query GetReviewers {
        topReviews {
          body @stream
          author @transform(from: "JSON") {
            name @stream {
              first
              last
            }
          }
        }
      }
    `;

    const { errors, queryPlan } = await execute({
      query,
    });

    expect(errors).toBeUndefined();
    expect(queryPlan).toCallService('reviews');
    expect(queryPlan).toCallService('accounts');
    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "reviews") {
            {
              topReviews {
                body @stream
                author @transform(from: "JSON") {
                  __typename
                  id
                }
              }
            }
          },
          Flatten(path: "topReviews.@.author") {
            Fetch(service: "accounts") {
              {
                ... on User {
                  __typename
                  id
                }
              } =>
              {
                ... on User {
                  name @stream {
                    first
                    last
                  }
                }
              }
            },
          },
        },
      }
    `);
  });

  // With relaxed composition, instead of erroring out if a directive is not declared everywhere, we compose but don't
  // include the directive in the supergraph and generate a hint. So the following test will complain that @stream 
  // is unknown in the query. Not that the hints tests do test we properly raise an hint in that case.
  it.skip("returns validation errors when directives aren't present across all services", async () => {
    const invalidService = {
      name: 'invalidService',
      typeDefs: gql`
        directive @invalid on QUERY
      `,
    };

    const query = `#graphql
      query GetReviewers {
        topReviews {
          body @stream
        }
      }
    `;

    expect(
      execute(
        {
          query,
        },
        [...fixtures, invalidService],
      ),
    ).rejects.toThrowErrorMatchingInlineSnapshot(`
      "[@invalid] -> Custom directives must be implemented in every service. The following services do not implement the @invalid directive: accounts, books, documents, inventory, product, reviews.

      [@stream] -> Custom directives must be implemented in every service. The following services do not implement the @stream directive: invalidService.

      [@transform] -> Custom directives must be implemented in every service. The following services do not implement the @transform directive: invalidService."
    `);
  });

  // Same as previous: we don't of error out on inconsistent execution directives. Here, we instead look at the intersection of locations
  // defined, and as that is empty, we don't include the directive in the supergraph (and raise a hint).
  // So the following test will complain that @stream is unknown in the query. Not that the hints tests do test we properly raise an hint in that case.
  it.skip("returns validation errors when directives aren't identical across all services", async () => {
    const invalidService = {
      name: 'invalid',
      typeDefs: gql`
        directive @stream on QUERY
      `,
    };

    const query = `#graphql
      query GetReviewers {
        topReviews {
          body @stream
        }
      }
    `;

    expect(
      execute(
        {
          query,
        },
        [...fixtures, invalidService],
      ),
    ).rejects.toThrowErrorMatchingInlineSnapshot(`
      "[@transform] -> Custom directives must be implemented in every service. The following services do not implement the @transform directive: invalid.

      [@stream] -> custom directives must be defined identically across all services. See below for a list of current implementations:
      	accounts: directive @stream on FIELD
      	books: directive @stream on FIELD
      	documents: directive @stream on FIELD
      	inventory: directive @stream on FIELD
      	product: directive @stream on FIELD
      	reviews: directive @stream on FIELD
      	invalid: directive @stream on QUERY"
    `);
  });
});
