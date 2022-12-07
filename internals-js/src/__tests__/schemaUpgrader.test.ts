import { FEDERATION2_LINK_WITH_FULL_IMPORTS } from '..';
import { ObjectType } from '../definitions';
import { buildSubgraph, Subgraphs } from '../federation';
import { UpgradeChangeID, UpgradeResult, upgradeSubgraphsIfNecessary } from '../schemaUpgrader';
import './matchers';

function changeMessages(res: UpgradeResult, subgraphName: string, id: UpgradeChangeID): string[] {
  const changes = res.changes?.get(subgraphName)?.get(id);
  return changes?.map(c => c.toString()) ?? [];
}

/**
 * A lot of the schema upgrader behaviors are tested as part of composing fed1 schema in `composeFed1Subgraphs.test.ts`.
 * This test file thus mostly focuses on the change-reporting of the schema upgrader.
 */

test('upgrade complex schema', () => {
  const s1 = `
    type Query {
      products: [Product!]! @provides(fields: "upc description")
    }

    interface I @key(fields: "upc") {
      upc: ID!
      description: String @external
    }

    extend type Product implements I @key(fields: "upc") {
      upc: ID! @external
      name: String @external
      inventory: Int @requires(fields: "upc")
      description: String @external
    }

    # A type with a genuine 'graphqQL' extension, to ensure the extend don't get removed.
    type Random {
      x: Int @provides(fields: "x")
    }

    extend type Random {
      y: Int
    }
  `;

  // Note that no changes are really expected on that 2nd schema: it is just there to make the example not throw due to
  // then Product type extension having no "base".
  const s2 = `
    type Product @key(fields: "upc") {
      upc: ID!
      name: String
      description: String
    }
  `;

  const subgraphs = new Subgraphs();
  subgraphs.add(buildSubgraph('s1', 'http://s1', s1));
  subgraphs.add(buildSubgraph('s2', 'http://s1', s2));
  const res = upgradeSubgraphsIfNecessary(subgraphs);
  expect(res.errors).toBeUndefined();

  expect(changeMessages(res, 's1', 'EXTERNAL_ON_TYPE_EXTENSION_REMOVAL')).toStrictEqual([
    'Removed @external from field "Product.upc" as it is a key of an extension type'
  ]);

  expect(changeMessages(res, 's1', 'TYPE_EXTENSION_REMOVAL')).toStrictEqual([
    'Switched type "Product" from an extension to a definition'
  ]);

  expect(changeMessages(res, 's1', 'UNUSED_EXTERNAL_REMOVAL')).toStrictEqual([
    'Removed @external field "Product.name" as it was not used in any @key, @provides or @requires'
  ]);

  expect(changeMessages(res, 's1', 'EXTERNAL_ON_INTERFACE_REMOVAL')).toStrictEqual([
    'Removed @external directive on interface type field "I.description": @external is nonsensical on interface fields'
  ]);

  expect(changeMessages(res, 's1', 'INACTIVE_PROVIDES_OR_REQUIRES_REMOVAL')).toStrictEqual([
    'Removed directive @requires(fields: "upc") on "Product.inventory": none of the fields were truly @external'
  ]);

  expect(changeMessages(res, 's1', 'INACTIVE_PROVIDES_OR_REQUIRES_FIELDS_REMOVAL')).toStrictEqual([
    'Updated directive @provides(fields: "upc description") on "Query.products" to @provides(fields: "description"): removed fields that were not truly @external'
  ]);

  expect(changeMessages(res, 's1', 'KEY_ON_INTERFACE_REMOVAL')).toStrictEqual([
    'Removed @key on interface "I": while allowed by federation 0.x, @key on interfaces were completely ignored/had no effect'
  ]);

  expect(changeMessages(res, 's1', 'PROVIDES_ON_NON_COMPOSITE_REMOVAL')).toStrictEqual([
    'Removed @provides directive on field "Random.x" as it is of non-composite type "Int": while not rejected by federation 0.x, such @provide is nonsensical and was ignored'
  ]);

  expect(res.subgraphs?.get('s1')?.toString()).toMatchString(`
    schema
      ${FEDERATION2_LINK_WITH_FULL_IMPORTS}
    {
      query: Query
    }

    type Query {
      products: [Product!]! @provides(fields: "description")
    }

    interface I {
      upc: ID!
      description: String
    }

    type Product implements I
      @key(fields: "upc")
    {
      upc: ID!
      inventory: Int
      description: String @external
    }

    type Random {
      x: Int
    }

    extend type Random {
      y: Int
    }
  `);
});

test('update federation directive non-string arguments', () => {
  const s = `
    type Query {
      a: A
    }

    type A @key(fields: id) @key(fields: ["id", "x"]) {
      id: String
      x: Int
    }
  `;

  const subgraphs = new Subgraphs();
  subgraphs.add(buildSubgraph('s', 'http://s', s));
  const res = upgradeSubgraphsIfNecessary(subgraphs);
  expect(res.errors).toBeUndefined();

  expect(changeMessages(res, 's', 'FIELDS_ARGUMENT_COERCION_TO_STRING')).toStrictEqual([
    'Coerced "fields" argument for directive @key for "A" into a string: coerced from @key(fields: id) to @key(fields: "id")',
    'Coerced "fields" argument for directive @key for "A" into a string: coerced from @key(fields: ["id", "x"]) to @key(fields: "id x")',
  ]);

  expect(res.subgraphs?.get('s')?.toString()).toMatchString(`
    schema
      ${FEDERATION2_LINK_WITH_FULL_IMPORTS}
    {
      query: Query
    }

    type Query {
      a: A
    }

    type A
      @key(fields: "id")
      @key(fields: "id x")
    {
      id: String
      x: Int
    }
  `);
})

test('remove tag on external field if found on definition', () => {
  const s1 = `
    type Query {
      a: A @provides(fields: "y")
    }

    type A @key(fields: "id") {
      id: String
      x: Int
      y: Int @external @tag(name: "a tag")
    }
  `;

  const s2 = `
    type A @key(fields: "id") {
      id: String
      y: Int @tag(name: "a tag")
    }
  `;

  const subgraphs = new Subgraphs();
  subgraphs.add(buildSubgraph('s1', 'http://s1', s1));
  subgraphs.add(buildSubgraph('s2', 'http://s2', s2));
  const res = upgradeSubgraphsIfNecessary(subgraphs);
  expect(res.errors).toBeUndefined();

  expect(changeMessages(res, 's1', 'REMOVED_TAG_ON_EXTERNAL')).toStrictEqual([
    'Removed @tag(name: "a tag") application on @external "A.y" as the @tag application is on another definition',
  ]);

  const typeAInS1 = res.subgraphs?.get('s1')?.schema.type("A") as ObjectType;
  const typeAInS2 = res.subgraphs?.get('s2')?.schema.type("A") as ObjectType;
  expect(typeAInS1.field("y")?.appliedDirectivesOf('tag').map((d) => d.toString())).toStrictEqual([]);
  expect(typeAInS2.field("y")?.appliedDirectivesOf('tag').map((d) => d.toString())).toStrictEqual([ '@tag(name: "a tag")' ]);
})
