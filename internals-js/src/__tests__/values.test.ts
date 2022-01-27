import {
  Schema,
} from '../../dist/definitions';
import { buildSchema } from '../../dist/buildSchema';
import { parseOperation } from '../../dist/operations';

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

  const operation = parseOperation(schema, `
    query {
      f(v: MONDAY)
    }
  `);

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
