import { introspect, batchIntrospect } from '../';
import { ExecutionResult, getIntrospectionQuery } from 'graphql';

describe('introspect', () => {
  it('should introspect correctly on valid sdl', () => {
    const validSDL = `schema
      {
        query: Query
      }

      type Query {
        hello: String
      }
    `;

    const query = getIntrospectionQuery();

    const introspectionResult = introspect(validSDL, query);
    const batchIntrospectionResult = batchIntrospect(validSDL, [query]);

    expect(introspectionResult.data).toBeDefined();
    assertIntrospectionSuccess(introspectionResult, JSON.stringify(introspectionResult));

    expect(batchIntrospectionResult?.length).toEqual(1);
    expect(batchIntrospectionResult[0]).toEqual(introspectionResult);
  });

  it('should fail introspection correctly on invalid sdl', () => {
    const invalidSDL = "THIS SDL IS DEFINITELY NOT VALID";
    const query = getIntrospectionQuery();

    const introspectionResult = introspect(invalidSDL, query);
    const batchIntrospectionResult = batchIntrospect(invalidSDL, [query]);

    assertIntrospectionFailure(introspectionResult, JSON.stringify(introspectionResult));
    const { errors } = introspectionResult;
    expect(errors).toBeDefined();
    expect(errors?.length).toEqual(1);

    expect(batchIntrospectionResult?.length).toEqual(1);
    expect(batchIntrospectionResult[0]).toEqual(introspectionResult);
  });
});

export function introspectionHasErrors(
  introspectionResult: ExecutionResult,
): boolean {
  return !!introspectionResult.errors?.length;
}

// This assertion function should be used for the sake of convenient type refinement.
// It should not be depended on for causing a test to fail. If an error is thrown
// from here, its use should be reconsidered.
function assertIntrospectionSuccess(
  introspectionResult: ExecutionResult,
  message?: string,
) {
  if (introspectionHasErrors(introspectionResult)) {
    throw new Error(message || 'Unexpected test failure');
  }
}

// This assertion function should be used for the sake of convenient type refinement.
// It should not be depended on for causing a test to fail. If an error is thrown
// from here, its use should be reconsidered.
function assertIntrospectionFailure(
  introspectionResult: ExecutionResult,
  message?: string,
) {
  if (!introspectionHasErrors(introspectionResult)) {
    throw new Error(message || 'Unexpected test failure');
  }
}
