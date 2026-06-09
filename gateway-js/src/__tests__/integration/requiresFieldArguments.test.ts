import gql from 'graphql-tag';
import { execute } from '../execution-utils';
import {
  astSerializer,
  queryPlanSerializer,
} from 'apollo-federation-integration-testsuite';

expect.addSnapshotSerializer(astSerializer);
expect.addSnapshotSerializer(queryPlanSerializer);

// Records the `arg` value the owning subgraph (B) receives for `x`, so we can assert the value supplied for the
// `@requires` field argument actually reaches the subgraph that owns the required field.
let receivedArg: number | null | undefined;

const serviceA = {
  name: 'a',
  typeDefs: gql`
    extend schema
      @link(
        url: "https://specs.apollo.dev/federation/v2.7"
        import: ["@key", "@external", "@requires"]
      )

    type Query {
      t: T
    }

    type T @key(fields: "id") {
      id: ID!
      x(arg: Int): Int @external
      y(arg: Int): Int @requires(fields: "x(arg: $arg)")
    }
  `,
  resolvers: {
    Query: {
      t() {
        return { id: '1' };
      },
    },
    T: {
      // `x` is provided as part of the entity representation fetched from subgraph B (the `@requires`).
      y(t: any) {
        return t.x;
      },
    },
  },
};

const serviceB = {
  name: 'b',
  typeDefs: gql`
    extend schema
      @link(url: "https://specs.apollo.dev/federation/v2.7", import: ["@key"])

    type T @key(fields: "id") {
      id: ID!
      x(arg: Int): Int
    }
  `,
  resolvers: {
    T: {
      __resolveReference(reference: any) {
        return reference;
      },
      x(_t: any, args: { arg: number | null }) {
        receivedArg = args.arg;
        return args.arg;
      },
    },
  },
};

beforeEach(() => {
  receivedArg = undefined;
});

it('forwards a client-supplied variable to the subgraph that owns the required field', async () => {
  const { data, errors } = await execute(
    {
      query: `#graphql
        query($v: Int) {
          t {
            y(arg: $v)
          }
        }
      `,
      variables: { v: 7 },
    },
    [serviceA, serviceB],
  );

  expect(errors).toBeUndefined();
  expect(receivedArg).toBe(7);
  expect(data).toEqual({ t: { y: 7 } });
});

it('inlines a literal argument for the subgraph that owns the required field', async () => {
  const { data, errors } = await execute(
    {
      query: `#graphql
        {
          t {
            y(arg: 7)
          }
        }
      `,
    },
    [serviceA, serviceB],
  );

  expect(errors).toBeUndefined();
  expect(receivedArg).toBe(7);
  expect(data).toEqual({ t: { y: 7 } });
});
