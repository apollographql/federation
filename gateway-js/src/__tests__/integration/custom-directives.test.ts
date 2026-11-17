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
          body @lowercase
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
                body @lowercase
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
          body @lowercase
          author @transform(from: "JSON") {
            name @lowercase {
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
                body @lowercase
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
                  name @lowercase {
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
  // include the directive in the supergraph and generate a hint. So the following test will complain that @lowercase
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
          body @lowercase
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

      [@lowercase] -> Custom directives must be implemented in every service. The following services do not implement the @lowercase directive: invalidService.

      [@transform] -> Custom directives must be implemented in every service. The following services do not implement the @transform directive: invalidService."
    `);
  });

  // Same as previous: we don't of error out on inconsistent execution directives. Here, we instead look at the intersection of locations
  // defined, and as that is empty, we don't include the directive in the supergraph (and raise a hint).
  // So the following test will complain that @lowercase is unknown in the query. Not that the hints tests do test we properly raise an hint in that case.
  it.skip("returns validation errors when directives aren't identical across all services", async () => {
    const invalidService = {
      name: 'invalid',
      typeDefs: gql`
        directive @lowercase on QUERY
      `,
    };

    const query = `#graphql
      query GetReviewers {
        topReviews {
          body @lowercase
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

      [@lowercase] -> custom directives must be defined identically across all services. See below for a list of current implementations:
      	accounts: directive @lowercase on FIELD
      	books: directive @lowercase on FIELD
      	documents: directive @lowercase on FIELD
      	inventory: directive @lowercase on FIELD
      	product: directive @lowercase on FIELD
      	reviews: directive @lowercase on FIELD
      	invalid: directive @lowercase on QUERY"
    `);
  });
});
