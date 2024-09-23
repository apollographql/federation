import { Schema } from '../definitions';
import { buildSchema } from '../buildSchema';
import { parseOperation } from '../operations';
import gql from 'graphql-tag';
import { printSchema } from '../print';
import { valueEquals } from '../values';
import { buildForErrors } from './testUtils';

function parseSchema(schema: string): Schema {
  try {
    return buildSchema(schema);
  } catch (e) {
    throw new Error('Error parsing the schema:\n' + e.toString());
  }
}

test('handles non-list value for list argument (as singleton)', () => {
  const schema = parseSchema(`
    enum Day {
      MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY
    }

    type Query {
      f(v: [Day]): Int
    }
  `);

  const operation = parseOperation(
    schema,
    `
    query {
      f(v: MONDAY)
    }
  `,
  );

  expect(operation.toString(false, false)).toBe('{ f(v: [MONDAY]) }');
  expect(operation.selectionSet.toSelectionSetNode()).toMatchInlineSnapshot(`
    Object {
      "kind": "SelectionSet",
      "selections": Array [
        Object {
          "alias": undefined,
          "arguments": Array [
            Object {
              "kind": "Argument",
              "name": Object {
                "kind": "Name",
                "value": "v",
              },
              "value": Object {
                "kind": "ListValue",
                "values": Array [
                  Object {
                    "kind": "EnumValue",
                    "value": "MONDAY",
                  },
                ],
              },
            },
          ],
          "directives": undefined,
          "kind": "Field",
          "name": Object {
            "kind": "Name",
            "value": "f",
          },
          "selectionSet": undefined,
        },
      ],
    }
  `);
});

describe('default value validation', () => {
  it('errors on invalid default value in field argument', () => {
    const doc = gql`
      type Query {
        f(a: Int = "foo"): Int
      }
    `;

    expect(buildForErrors(doc)).toStrictEqual([
      [
        'INVALID_GRAPHQL',
        '[S] Invalid default value (got: "foo") provided for argument Query.f(a:) of type Int.',
      ],
    ]);
  });

  it('errors on invalid default value in directive argument', () => {
    const doc = gql`
      type Query {
        f: Int
      }

      directive @myDirective(a: Int = "foo") on FIELD
    `;

    expect(buildForErrors(doc)).toStrictEqual([
      [
        'INVALID_GRAPHQL',
        '[S] Invalid default value (got: "foo") provided for argument @myDirective(a:) of type Int.',
      ],
    ]);
  });

  it('errors on invalid default value in input field', () => {
    const doc = gql`
      input I {
        x: Int = "foo"
      }
    `;

    expect(buildForErrors(doc)).toStrictEqual([
      [
        'INVALID_GRAPHQL',
        '[S] Invalid default value (got: "foo") provided for input field I.x of type Int.',
      ],
    ]);
  });

  it('errors on invalid default value for existing input field', () => {
    const doc = gql`
      type Query {
        f(i: I = { x: 2, y: "3" }): Int
      }

      input I {
        x: Int
        y: Int
      }
    `;

    expect(buildForErrors(doc)).toStrictEqual([
      [
        'INVALID_GRAPHQL',
        '[S] Invalid default value (got: {x: 2, y: "3"}) provided for argument Query.f(i:) of type I.',
      ],
    ]);
  });

  it('errors on default value containing unexpected input fields', () => {
    const doc = gql`
      type Query {
        f(i: I = { x: 1, y: 2, z: 3 }): Int
      }

      input I {
        x: Int
        y: Int
      }
    `;

    expect(buildForErrors(doc)).toStrictEqual([
      [
        'INVALID_GRAPHQL',
        '[S] Invalid default value (got: {x: 1, y: 2, z: 3}) provided for argument Query.f(i:) of type I.',
      ],
    ]);
  });

  it('errors on default value being unknown enum value', () => {
    const doc = gql`
      type Query {
        f(e: E = THREE): Int
      }

      enum E {
        ONE
        TWO
      }
    `;

    // Note that it is slightly imperfect that the error shows the value as a "string" but is the result
    // of enum values being encoded by string value internally (and while, when a value type-check correctly,
    // we can use the type to display enum values properly, this is exactly a case where the value is not
    // correctly type-checked, so we currently don't have a good way to figure out it's an enum when we display
    // it in the error message). We could fix this someday if we change to using a specific class/object for
    // enum values internally (though this might have backward compatbility constraints), but in the meantime,
    // it's unlikely to trip users too much.
    expect(buildForErrors(doc)).toStrictEqual([
      [
        'INVALID_GRAPHQL',
        '[S] Invalid default value (got: "THREE") provided for argument Query.f(e:) of type E.',
      ],
    ]);
  });

  it('errors on default value being unknown enum value (as string)', () => {
    const doc = gql`
      type Query {
        f(e: E = "TWOO"): Int
      }

      enum E {
        ONE
        TWO
      }
    `;

    expect(buildForErrors(doc)).toStrictEqual([
      [
        'INVALID_GRAPHQL',
        '[S] Invalid default value (got: "TWOO") provided for argument Query.f(e:) of type E.',
      ],
    ]);
  });

  it('accepts default value enum value as string, if a valid enum value', () => {
    // Please note that this test show we accept strings for enum even though the GraphQL spec kind
    // of say we shouldn't. But the graphQL spec also doesn't really do default value validation,
    // which be believe is just wrong, and as a consequence we've seen customer schema with string-for-enum
    // in default values, and it doesn't sound very harmfull to allow it (the spec even admits that some
    // transport may have to deal with enums as string anyway), so we prefer having that allowance in
    // federation (if this ever become a huge issue for some users, we could imagine to add a "strict"
    // more that start refusing this).
    const doc = gql`
      type Query {
        f(e: E = "TWO"): Int
      }

      enum E {
        ONE
        TWO
      }
    `;

    expect(buildForErrors(doc)).toBeUndefined();
  });

  it('accepts any value for a custom scalar in field agument', () => {
    const doc = gql`
      type Query {
        f(i: Scalar = { x: 2, y: "3" }): Int
      }

      scalar Scalar
    `;

    expect(buildForErrors(doc)).toBeUndefined();
  });

  it('accepts any value for a custom scalar in directive agument', () => {
    const doc = gql`
      type Query {
        f: Int
      }

      directive @myDirective(i: Scalar = { x: 2, y: "3" }) on FIELD
      scalar Scalar
    `;

    expect(buildForErrors(doc)).toBeUndefined();
  });

  it('accepts any value for a custom scalar in an input field', () => {
    const doc = gql`
      input I {
        x: Scalar = { z: { a: 4 } }
      }

      scalar Scalar
    `;

    expect(buildForErrors(doc)).toBeUndefined();
  });

  it('accepts default value coercible to list for a list type', () => {
    const doc = gql`
      type Query {
        f(x: [String] = "foo"): Int
      }
    `;

    expect(buildForErrors(doc)).toBeUndefined();
  });

  it('accepts default value coercible to list for a list type through multiple coercions', () => {
    const doc = gql`
      type Query {
        f(x: [[[String]!]]! = "foo"): Int
      }
    `;

    expect(buildForErrors(doc)).toBeUndefined();
  });

  it('errors on default value no coercible to list for a list type through multiple coercions', () => {
    const doc = gql`
      type Query {
        f(x: [[[String]!]]! = 2): Int
      }
    `;

    expect(buildForErrors(doc)).toStrictEqual([
      [
        'INVALID_GRAPHQL',
        '[S] Invalid default value (got: 2) provided for argument Query.f(x:) of type [[[String]!]]!.',
      ],
    ]);
  });

  it('accepts default value coercible to its type but needing multiple/nested coercions', () => {
    const doc = gql`
      type Query {
        f(x: I = { j: { x: 1, z: "Foo" } }): Int
      }

      input I {
        j: [J]
      }

      input J {
        x: ID
        y: ID
        z: ID
      }
    `;

    expect(buildForErrors(doc)).toBeUndefined();
  });

  it('accepts default values that, if actually coerced, woudl result in infinite loops', () => {
    // This example is stolen from this comment: https://github.com/graphql/graphql-spec/pull/793#issuecomment-738736539
    // It essentially show that while, as the other tests of this file show, we 1) validate default value against
    // their type and 2) ensures default values coercible to said type don't fail such validation, we also do
    // _not_ do the actual coercion of those values, which in this example would lead to an infinite loop.
    const doc = gql`
      input A {
        b: B = {}
      }

      input B {
        a: A = {}
      }

      type Query {
        q(a: A = {}): Int
      }
    `;

    expect(buildForErrors(doc)).toBeUndefined();
  });

  it('errors on null default value for non-nullable input', () => {
    const doc = gql`
      type Query {
        f(i: Int! = null): Int
      }
    `;

    expect(buildForErrors(doc)).toStrictEqual([
      [
        'INVALID_GRAPHQL',
        '[S] Invalid default value (got: null) provided for argument Query.f(i:) of type Int!.',
      ],
    ]);
  });

  it('Accepts null default value for nullable input', () => {
    const doc = gql`
      type Query {
        f(i: Int = null): Int
      }
    `;

    expect(buildForErrors(doc)).toBeUndefined();
  });
});

describe('values printing', () => {
  it('prints enums value correctly within multiple lists', () => {
    const sdl = `
      type Query {
        f(a: [[[E]!]!] = [[[FOO], [BAR]]]): Int
      }

      enum E {
        FOO
        BAR
      }
    `;
    expect(printSchema(parseSchema(sdl))).toMatchString(sdl);
  });

  it('prints enums value when its coercible to list through multiple coercions', () => {
    const sdl = `
      type Query {
        f(a: [[[E]!]!] = FOO): Int
      }

      enum E {
        FOO
        BAR
      }
    `;
    expect(printSchema(parseSchema(sdl))).toMatchString(sdl);
  });
});

describe('objectEquals tests', () => {
  it('simple object equality tests', () => {
    expect(valueEquals({ foo: 'foo' }, { foo: 'foo' })).toBe(true);
    expect(
      valueEquals(
        { foo: 'foo', bar: undefined },
        { foo: 'foo', bar: undefined },
      ),
    ).toBe(true);
    expect(valueEquals({ foo: 'foo' }, { foo: 'foo', bar: undefined })).toBe(
      false,
    );
    expect(valueEquals({ foo: 'foo', bar: undefined }, { foo: 'foo' })).toBe(
      false,
    );
    expect(valueEquals({}, null)).toBe(false);
  });
});
