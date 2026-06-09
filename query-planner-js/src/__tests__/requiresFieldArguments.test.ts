import {
  operationFromDocument,
  asFed2SubgraphDocument,
  ServiceDefinition,
} from '@apollo/federation-internals';
import { composeServices } from '@apollo/composition';
import gql from 'graphql-tag';
import { composeAndCreatePlanner, findFetchNodes } from './testHelper';

// Subgraph B owns the external field(s) referenced by `@requires` in subgraph A.
const subgraphB: ServiceDefinition = {
  name: 'B',
  typeDefs: gql`
    type T @key(fields: "id") {
      id: ID!
      x(arg: Int): Int
    }
  `,
};

// Composes `subgraphA` with `subgraphB` (both as Fed2 subgraphs) and returns the composition result so tests can
// assert on either success or errors.
function compose(subgraphA: ServiceDefinition) {
  return composeServices([
    { ...subgraphA, typeDefs: asFed2SubgraphDocument(subgraphA.typeDefs) },
    { ...subgraphB, typeDefs: asFed2SubgraphDocument(subgraphB.typeDefs) },
  ]);
}

// Returns the (whitespace-stripped) operation string of the fetch(es) sent to subgraph B for `operation`.
// `composeAndCreatePlanner` turns the given subgraphs into Fed2 subgraphs itself, so the typeDefs are passed raw.
function subgraphBFetch(
  subgraphA: ServiceDefinition,
  operation: string,
): string {
  const [api, queryPlanner] = composeAndCreatePlanner(subgraphA, subgraphB);
  const plan = queryPlanner.buildQueryPlan(
    operationFromDocument(api, gql(operation)),
  );
  const fetches = findFetchNodes('B', plan.node);
  expect(fetches.length).toBeGreaterThan(0);
  return fetches.map((f) => f.operation.replace(/\s/g, '')).join('\n');
}

describe('@requires with field arguments', () => {
  test('a static literal argument value composes', () => {
    const result = compose({
      name: 'A',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "id") {
          id: ID!
          x(arg: Int): Int @external
          y: Int @requires(fields: "x(arg: 42)")
        }
      `,
    });
    expect(result.errors).toBeUndefined();
  });

  test('a variable argument value composes', () => {
    const result = compose({
      name: 'A',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "id") {
          id: ID!
          x(arg: Int): Int @external
          y(arg: Int): Int @requires(fields: "x(arg: $arg)")
        }
      `,
    });
    expect(result.errors).toBeUndefined();
  });

  test('an unbound variable argument value is rejected', () => {
    const result = compose({
      name: 'A',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "id") {
          id: ID!
          x(arg: Int): Int @external
          y: Int @requires(fields: "x(arg: $arg)")
        }
      `,
    });
    expect(result.errors).toBeDefined();
    expect(result.errors!.map((e) => e.message)).toContainEqual(
      expect.stringContaining(
        'variable "$arg" is not defined; a variable in a @requires field set must reference an argument of "T.y"',
      ),
    );
    expect(
      result.errors!.some(
        (e) => (e.extensions?.code as string) === 'REQUIRES_INVALID_FIELDS',
      ),
    ).toBe(true);
  });

  test('a client-supplied variable is forwarded and a literal is inlined into the subgraph fetch', () => {
    const subgraphA: ServiceDefinition = {
      name: 'A',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "id") {
          id: ID!
          x(arg: Int): Int @external
          y(arg: Int): Int @requires(fields: "x(arg: $arg)")
        }
      `,
    };

    expect(
      subgraphBFetch(subgraphA, 'query($v: Int) { t { y(arg: $v) } }'),
    ).toContain('x(arg:$v)');
    expect(subgraphBFetch(subgraphA, '{ t { y(arg: 7) } }')).toContain(
      'x(arg:7)',
    );
  });

  test('an omitted nullable argument substitutes null', () => {
    const subgraphA: ServiceDefinition = {
      name: 'A',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "id") {
          id: ID!
          x(arg: Int): Int @external
          y(arg: Int): Int @requires(fields: "x(arg: $arg)")
        }
      `,
    };

    expect(subgraphBFetch(subgraphA, '{ t { y } }')).toContain('x(arg:null)');
  });

  test('an omitted argument with a schema default substitutes the default', () => {
    const subgraphA: ServiceDefinition = {
      name: 'A',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "id") {
          id: ID!
          x(arg: Int): Int @external
          y(arg: Int = 5): Int @requires(fields: "x(arg: $arg)")
        }
      `,
    };

    expect(subgraphBFetch(subgraphA, '{ t { y } }')).toContain('x(arg:5)');
  });

  test('a variable nested in a list argument threads through', () => {
    const subgraphA: ServiceDefinition = {
      name: 'A',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "id") {
          id: ID!
          x(args: [Int]): Int @external
          y(arg: Int): Int @requires(fields: "x(args: [$arg])")
        }
      `,
    };
    const subgraphBList: ServiceDefinition = {
      name: 'B',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          x(args: [Int]): Int
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(
      subgraphA,
      subgraphBList,
    );
    const plan = queryPlanner.buildQueryPlan(
      operationFromDocument(
        api,
        gql`
          query ($v: Int) {
            t {
              y(arg: $v)
            }
          }
        `,
      ),
    );
    const fetch = findFetchNodes('B', plan.node)
      .map((f) => f.operation.replace(/\s/g, ''))
      .join('\n');
    expect(fetch).toContain('x(args:[$v])');
  });

  test('multiple variable arguments each thread through', () => {
    const subgraphA: ServiceDefinition = {
      name: 'A',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "id") {
          id: ID!
          x(arg: Int): Int @external
          z(arg: Int): Int @external
          y(a: Int, b: Int): Int @requires(fields: "x(arg: $a) z(arg: $b)")
        }
      `,
    };
    const subgraphBMulti: ServiceDefinition = {
      name: 'B',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          x(arg: Int): Int
          z(arg: Int): Int
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(
      subgraphA,
      subgraphBMulti,
    );
    const plan = queryPlanner.buildQueryPlan(
      operationFromDocument(
        api,
        gql`
          query ($v1: Int, $v2: Int) {
            t {
              y(a: $v1, b: $v2)
            }
          }
        `,
      ),
    );
    const fetch = findFetchNodes('B', plan.node)
      .map((f) => f.operation.replace(/\s/g, ''))
      .join('\n');
    expect(fetch).toContain('x(arg:$v1)');
    expect(fetch).toContain('z(arg:$v2)');
  });

  test('an incompatible variable type is rejected', () => {
    const result = compose({
      name: 'A',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "id") {
          id: ID!
          x(arg: Int): Int @external
          y(arg: String): Int @requires(fields: "x(arg: $arg)")
        }
      `,
    });
    expect(result.errors).toBeDefined();
    expect(result.errors!.map((e) => e.message)).toContainEqual(
      expect.stringContaining(
        'variable "$arg" cannot be used for argument "arg" of field "x": it is bound to argument "arg" of type "String", which is not compatible with the expected type "Int"',
      ),
    );
    expect(
      result.errors!.some(
        (e) => (e.extensions?.code as string) === 'REQUIRES_INVALID_FIELDS',
      ),
    ).toBe(true);
  });

  test('a variable in a @provides field set is rejected', () => {
    const result = composeServices([
      {
        name: 'A',
        typeDefs: asFed2SubgraphDocument(gql`
          type Query {
            u(arg: Int): U @provides(fields: "x(arg: $arg)")
          }

          type U @key(fields: "id") {
            id: ID!
            x(arg: Int): Int @external
          }
        `),
      },
      {
        name: 'B',
        typeDefs: asFed2SubgraphDocument(gql`
          type U @key(fields: "id") {
            id: ID!
            x(arg: Int): Int
          }
        `),
      },
    ]);
    expect(result.errors).toBeDefined();
  });
});
