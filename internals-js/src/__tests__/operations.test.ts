import {
  Schema,
} from '../../dist/definitions';
import { buildSchema } from '../../dist/buildSchema';
import { parseOperation } from '../../dist/operations';
import './matchers';

function parseSchema(schema: string): Schema {
  try {
    return buildSchema(schema);
  } catch (e) {
    throw new Error('Error parsing the schema:\n' + e.toString());
  }
}

test('fragments optimization of selection sets', () => {
  const schema = parseSchema(`
    type Query {
      t: T1
    }

    interface I {
      b: Int
    }

    type T1 {
      a: Int
      b: Int
      u: U
    }

    type T2 {
      x: String
      y: String
      b: Int
      u: U
    }

    union U = T1 | T2
  `);

  const operation = parseOperation(schema, `
    fragment OnT1 on T1 {
      a
      b
    }

    fragment OnT2 on T2 {
      x
      y
    }

    fragment OnI on I {
      b
    }

    fragment OnU on U {
      ...OnI
      ...OnT1
      ...OnT2
    }

    query {
      t {
        ...OnT1
        ...OnT2
        ...OnI
        u {
          ...OnU
        }
      }
    }
  `);

  const withoutFragments = parseOperation(schema, operation.toString(true, true));
  expect(withoutFragments.toString()).toMatchString(`
    {
      t {
        ... on T1 {
          a
          b
        }
        ... on T2 {
          x
          y
        }
        ... on I {
          b
        }
        u {
          ... on U {
            ... on I {
              b
            }
            ... on T1 {
              a
              b
            }
            ... on T2 {
              x
              y
            }
          }
        }
      }
    }
  `);

  const optimized = withoutFragments.optimize(operation.selectionSet.fragments!);
  // Note that we expect onU to *not* be recreated because, by default, optimize only
  // add add back a fragment if it is used at least twice (otherwise, the fragment just
  // make the query bigger).
  expect(optimized.toString()).toMatchString(`
    fragment OnT1 on T1 {
      a
      b
    }

    fragment OnT2 on T2 {
      x
      y
    }

    fragment OnI on I {
      b
    }

    {
      t {
        ...OnT1
        ...OnT2
        ...OnI
        u {
          ... on U {
            ...OnI
            ...OnT1
            ...OnT2
          }
        }
      }
    }
  `);
});
