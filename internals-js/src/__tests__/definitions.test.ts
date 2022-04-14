import {
  Schema,
  ObjectType,
  Type,
  DirectiveDefinition,
  InterfaceType,
  EnumType,
  SchemaElement,
  UnionType,
  InputObjectType,
} from '../../dist/definitions';
import {
  printSchema as printGraphQLjsSchema
} from 'graphql';
import { defaultPrintOptions, printSchema } from '../../dist/print';
import { buildSchema } from '../../dist/buildSchema';
import { buildSubgraph, federationMetadata, newEmptyFederation2Schema } from '../../dist/federation';
import './matchers';

function parseSchema(schema: string): Schema {
  try {
    return buildSchema(schema);
  } catch (e) {
    throw new Error(e.toString());
  }
}

function expectObjectType(type?: Type): asserts type is ObjectType {
  expect(type).toBeDefined();
  expect(type!.kind).toBe('ObjectType');
}

function expectInterfaceType(type?: Type): asserts type is InterfaceType {
  expect(type).toBeDefined();
  expect(type!.kind).toBe('InterfaceType');
}

function expectUnionType(type?: Type): asserts type is UnionType {
  expect(type).toBeDefined();
  expect(type!.kind).toBe('UnionType');
}

function expectEnumType(type?: Type): asserts type is EnumType {
  expect(type).toBeDefined();
  expect(type!.kind).toBe('EnumType');
}

declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveField(name: string, type?: Type): R;
      toHaveDirective<TArgs extends {[key: string]: any}>(directive: DirectiveDefinition<TArgs>, args?: TArgs): R;
    }
  }
}

expect.extend({
  toHaveField(parentType: ObjectType | InterfaceType, name: string, type?: Type) {
    const field = parentType.field(name);
    if (!field) {
      return {
        message: () => `Cannot find field '${name}' in Object Type ${parentType} with fields [${[...parentType.fields()]}]`,
        pass: false
      };
    }
    if (field.name != name) {
      return {
        message: () => `Type ${parentType} has a field linked to name ${name} but that field name is actually ${field.name}`,
        pass: false
      };
    }
    if (type && field.type != type) {
      return {
        message: () => `Expected field ${parentType}.${name} to have type ${type} but got type ${field.type}`,
        pass: false
      };
    }
    return {
      message: () => `Expected ${parentType} not to have field ${name} but it does (${field})`,
      pass: true
    }
  },

  toHaveDirective(element: SchemaElement<any, any>, definition: DirectiveDefinition, args?: Record<string, any>) {
    const directives = element.appliedDirectivesOf(definition);
    if (directives.length == 0) {
      return {
        message: () => `Cannot find directive @${definition} applied to element ${element} (whose applied directives are [${element.appliedDirectives.join(', ')}]`,
        pass: false
      };
    }
    if (!args) {
      return {
        message: () => `Expected directive @${definition} to not be applied to ${element} but it is`,
        pass: true
      };
    }

    for (const directive of directives) {
      if (directive.matchArguments(args)) {
        return {
          // Not 100% certain that message is correct but I don't think it's going to be used ...
          message: () => `Expected directive ${directive.name} applied to ${element} to have arguments ${JSON.stringify(args)} but got ${JSON.stringify(directive.arguments)}`,
          pass: true
        };
      }
    }
    return {
      message: () => `Element ${element} has application of directive @${definition} but not with the requested arguments. Got applications: [${directives.join(', ')}]`,
      pass: false
    }
  },
});

test('building a simple schema programatically', () => {
  const schema = newEmptyFederation2Schema();
  const queryType = schema.schemaDefinition.setRoot('query', schema.addType(new ObjectType('Query'))).type;
  const typeA = schema.addType(new ObjectType('A'));
  const key = federationMetadata(schema)!.keyDirective();

  queryType.addField('a', typeA);
  typeA.addField('q', queryType);
  typeA.applyDirective(key, { fields: 'a'});

  expect(queryType).toBe(schema.schemaDefinition.root('query')!.type);
  expect(queryType).toHaveField('a', typeA);
  expect(typeA).toHaveField('q', queryType);
  expect(typeA).toHaveDirective(key, { fields: 'a'});
});


test('parse schema and modify', () => {
  const sdl = `
    schema {
      query: MyQuery
    }

    directive @inaccessible on FIELD_DEFINITION | ARGUMENT_DEFINITION

    type A {
      f1(x: Int @inaccessible): String
      f2: String @inaccessible
    }

    type MyQuery {
      a: A
      b: Int
    }`;
  const schema = parseSchema(sdl);

  const queryType = schema.type('MyQuery')!;
  const typeA = schema.type('A')!;
  const inaccessibleDirective = schema.directive('inaccessible')!;
  expectObjectType(queryType);
  expectObjectType(typeA);
  expect(schema.schemaDefinition.root('query')!.type).toBe(queryType);
  expect(queryType).toHaveField('a', typeA);
  const f2 = typeA.field('f2');
  expect(f2).toHaveDirective(inaccessibleDirective);
  expect(printSchema(schema)).toMatchString(sdl);

  expect(typeA).toHaveField('f1');
  typeA.field('f1')!.remove();
  expect(typeA).not.toHaveField('f1');
});

test('removal of all directives of a schema', () => {
  const subgraph = buildSubgraph('foo', '', `
    schema @foo {
      query: Query
    }

    type Query {
      a(id: String @bar): A @inaccessible
    }

    type A {
      a1: String @foo
      a2: [Int]
    }

    type B @foo {
      b: String @bar
    }

    union U @foobar = A | B

    directive @inaccessible on FIELD_DEFINITION
    directive @foo on SCHEMA | FIELD_DEFINITION | OBJECT
    directive @foobar on UNION
    directive @bar on ARGUMENT_DEFINITION | FIELD_DEFINITION
  `).validate();

  const schema = subgraph.schema;
  for (const element of schema.allSchemaElement()) {
    element.appliedDirectives.forEach(d => d.remove());
  }

  expect(subgraph.toString()).toMatchString(`
    directive @inaccessible on FIELD_DEFINITION

    directive @foo on SCHEMA | FIELD_DEFINITION | OBJECT

    directive @foobar on UNION

    directive @bar on ARGUMENT_DEFINITION | FIELD_DEFINITION

    type Query {
      a(id: String): A
    }

    type A {
      a1: String
      a2: [Int]
    }

    type B {
      b: String
    }

    union U = A | B`);
});

test('removal of all inaccessible elements of a schema', () => {
  const subgraph = buildSubgraph('foo', '', `
    schema @foo {
      query: Query
    }

    type Query {
      a(id: String @bar, arg: Int @inaccessible): A
    }

    type A {
      a1: String @inaccessible
      a2: [Int]
    }

    type B @inaccessible {
      b: String @bar
    }

    union U @inaccessible = A | B

    directive @inaccessible on FIELD_DEFINITION | OBJECT | ARGUMENT_DEFINITION | UNION
    directive @foo on SCHEMA | FIELD_DEFINITION
    directive @bar on ARGUMENT_DEFINITION | FIELD_DEFINITION
  `);

  const schema = subgraph.schema;
  const inaccessibleDirective = schema.directive('inaccessible')!;
  for (const element of schema.allNamedSchemaElement()) {
    if (element.hasAppliedDirective(inaccessibleDirective)) {
      element.remove();
    }
  }

  expect(subgraph.toString()).toMatchString(`
    schema
      @foo
    {
      query: Query
    }

    directive @inaccessible on FIELD_DEFINITION | OBJECT | ARGUMENT_DEFINITION | UNION

    directive @foo on SCHEMA | FIELD_DEFINITION

    directive @bar on ARGUMENT_DEFINITION | FIELD_DEFINITION

    type Query {
      a(id: String @bar): A
    }

    type A {
      a2: [Int]
    }
  `);
});

test('handling of interfaces', () => {
  const schema = parseSchema(`
    type Query {
      bestIs: [I!]!
    }

    interface B {
      a: Int
    }

    interface I implements B {
      a: Int
      b: String
    }

    type T1 implements B & I {
      a: Int
      b: String
      c: Int
    }

    type T2 implements B & I {
      a: Int
      b: String
      c: String
    }
  `);

  const b = schema.type('B');
  const i = schema.type('I');
  const t1 = schema.type('T1');
  const t2 = schema.type('T2');
  expectInterfaceType(b);
  expectInterfaceType(i);
  expectObjectType(t1);
  expectObjectType(t2);

  for (const t of [b, i, t1, t2]) {
    expect(t).toHaveField('a', schema.intType());
  }
  for (const t of [i, t1, t2]) {
    expect(t).toHaveField('b', schema.stringType());
  }
  expect(t1).toHaveField('c', schema.intType());
  expect(t2).toHaveField('c', schema.stringType());

  expect(i.implementsInterface(b.name)).toBeTruthy();
  expect(t1.implementsInterface(b.name)).toBeTruthy();
  expect(t1.implementsInterface(i.name)).toBeTruthy();
  expect(t2.implementsInterface(b.name)).toBeTruthy();
  expect(t2.implementsInterface(i.name)).toBeTruthy();

  expect(b.allImplementations()).toEqual([i, t1, t2]);
  expect(i.allImplementations()).toEqual([t1, t2]);

  for (const itf of [b, i]) {
    expect(itf.possibleRuntimeTypes()).toEqual([t1, t2]);
  }

  b.remove();

  expect(printSchema(schema)).toMatchString(`
    type Query {
      bestIs: [I!]!
    }

    interface I {
      a: Int
      b: String
    }

    type T1 implements I {
      a: Int
      b: String
      c: Int
    }

    type T2 implements I {
      a: Int
      b: String
      c: String
    }`);
});

test('handling of enums', () => {
  const schema = parseSchema(`
    type Query {
      a: A
    }

    enum E {
      V1
      V2
    }

    type A {
      a: Int
      e: E
    }
  `);

  const a = schema.type('A');
  const e = schema.type('E');
  expectObjectType(a);
  expectEnumType(e);

  expect(a).toHaveField('e', e);
  const v1 = e.value('V1');
  const v2 = e.value('V2');
  expect(v1).toBeDefined();
  expect(v2).toBeDefined();
  expect(e.values).toEqual([v1, v2]);
});

test('handling of descriptions', () => {
  const sdl = `
    """A super schema full of great queries"""
    schema {
      query: ASetOfQueries
    }

    """Marks field that are deemed more important than others"""
    directive @Important(
      """The reason for the importance of this field"""
      why: String = "because!"
    ) on FIELD_DEFINITION

    """The actual queries of the schema"""
    type ASetOfQueries {
      """Returns a set of products"""
      bestProducts: [Product!]!

      """Finds a product by ID"""
      product(
        """The ID identifying the product"""
        id: ID!
      ): Product
    }

    """A product that is also a book"""
    type Book implements Product {
      id: ID!
      description: String!

      """
      Number of pages in the book. Good so the customer knows its buying a 1000 page book for instance
      """
      pages: Int @Important
    }

    extend type Book {
      author: String
    }

    type DVD implements Product {
      id: ID!
      description: String!

      """The film author"""
      author: String @Important(why: "it's good to give credit!")
    }

    """Common interface to all our products"""
    interface Product {
      """Identifies the product"""
      id: ID!

      """
      Something that explains what the product is. This can just be the title of the product, but this can be more than that if we want to. But it should be useful you know, otherwise our customer won't buy it.
      """
      description: String!
    }`;
  const schema = parseSchema(sdl);

  // Checking we get back the schema through printing it is mostly good enough, but let's just
  // make sure long descriptions don't get annoying formatting newlines for instance when acessed on the
  // schema directly.
  const longComment = "Something that explains what the product is. This can just be the title of the product, but this can be more than that if we want to. But it should be useful you know, otherwise our customer won't buy it.";
  const product = schema.type('Product');
  expectInterfaceType(product);
  expect(product.field('description')!.description).toBe(longComment);

  expect(printSchema(schema)).toMatchString(sdl);
});

test('handling of extensions', () => {
  const sdl = `
    directive @foo on SCALAR

    type Query {
      f: Int
    }

    interface AInterface {
      i1: Int
    }

    extend interface AInterface {
      i2: Int
    }

    scalar AScalar

    extend scalar AScalar
      @foo

    extend type AType {
      t1: Int
      t2: String
    }

    type AType2 {
      t1: String
    }

    type AType3 {
      t2: Int
    }

    union AUnion = AType | AType2

    extend union AUnion = AType3
  `;

  // Note that we mark it as a subgraph because validation of extension is relaxed. In other words, it's
  // expected that this will fail validation as a normal schema even though we don't use any
  // federation directives.
  const subgraph = buildSubgraph('foo', '', sdl);
  expect(subgraph.toString()).toMatchString(sdl);
  const schema = subgraph.schema;

  const atype = schema.type('AType');
  expectObjectType(atype);
  expect(atype).toHaveField('t1', schema.intType());
  expect(atype).toHaveField('t2', schema.stringType());

  const aunion = schema.type('AUnion');
  expectUnionType(aunion);
  expect([...aunion.types()].map(t => t.name)).toEqual(['AType', 'AType2', 'AType3']);

  expect(subgraph.toString({ ...defaultPrintOptions, mergeTypesAndExtensions: true })).toMatchString(`
    directive @foo on SCALAR

    type Query {
      f: Int
    }

    interface AInterface {
      i1: Int
      i2: Int
    }

    scalar AScalar
      @foo

    type AType {
      t1: Int
      t2: String
    }

    type AType2 {
      t1: String
    }

    type AType3 {
      t2: Int
    }

    union AUnion = AType | AType2 | AType3
  `);
});

test('default arguments for directives', () => {
  const sdl = `
    directive @Example(inputObject: ExampleInputObject! = {}) on FIELD_DEFINITION

    type Query {
      v1: Int @Example
      v2: Int @Example(inputObject: {})
      v3: Int @Example(inputObject: {number: 3})
    }

    input ExampleInputObject {
      number: Int! = 3
    }
  `;

  const schema = parseSchema(sdl);
  expect(printSchema(schema)).toMatchString(sdl);

  const query = schema.schemaDefinition.root('query')!.type;
  const exampleDirective = schema.directive('Example')!;
  expect(query).toHaveField('v1');
  expect(query).toHaveField('v2');
  expect(query).toHaveField('v3');
  const v1 = query.field('v1')!;
  const v2 = query.field('v2')!;
  const v3 = query.field('v3')!;

  const d1 = v1.appliedDirectivesOf(exampleDirective)[0];
  const d2 = v2.appliedDirectivesOf(exampleDirective)[0];
  const d3 = v3.appliedDirectivesOf(exampleDirective)[0];

  expect(d1.arguments()).toEqual({});
  expect(d2.arguments()).toEqual({ inputObject: {}});
  expect(d3.arguments()).toEqual({ inputObject: { number: 3 }});

  expect(d1.arguments(true)).toEqual({ inputObject: { number: 3 }});
  expect(d2.arguments(true)).toEqual({ inputObject: { number: 3 }});
  expect(d3.arguments(true)).toEqual({ inputObject: { number: 3 }});
});

test('correctly convert to a graphQL-js schema', () => {
  const sdl = `
    schema {
      query: MyQuery
    }

    directive @foo on FIELD

    type A {
      f1(x: Int): String
      f2: String
    }

    type MyQuery {
      a: A
      b: Int
    }
  `;
  const schema = parseSchema(sdl);

  const graphqQLSchema = schema.toGraphQLJSSchema();
  expect(printGraphQLjsSchema(graphqQLSchema)).toMatchString(sdl);
});

test('retrieving elements by coordinate', () => {
  const sdl = `
    directive @foo(bar: Int) on FIELD

    type Query {
      t: T
    }

    type T {
      f1(x: Int): String
      f2: String
    }

    interface I {
      i: String
    }

    input O {
      x: Int
    }

    enum E {
      FOO
      BAR
    }

    scalar Date
  `;
  const schema = parseSchema(sdl);

  expect(schema.elementByCoordinate('Query')).toBe(schema.schemaDefinition.rootType('query'));
  expect(schema.elementByCoordinate('Query.t')).toBe(schema.schemaDefinition.rootType('query')?.field('t'));

  const typeT = schema.type('T') as ObjectType;
  expect(schema.elementByCoordinate('T')).toBe(typeT);
  expect(schema.elementByCoordinate('T.f1')).toBe(typeT.field('f1'));
  expect(schema.elementByCoordinate('T.f2')).toBe(typeT.field('f2'));
  expect(schema.elementByCoordinate('T.f1(x:)')).toBe(typeT.field('f1')?.argument('x'));

  const typeI = schema.type('I') as InterfaceType;
  expect(schema.elementByCoordinate('I')).toBe(typeI);
  expect(schema.elementByCoordinate('I.i')).toBe(typeI.field('i'));

  const typeO = schema.type('O') as InputObjectType;
  expect(schema.elementByCoordinate('O')).toBe(typeO);
  expect(schema.elementByCoordinate('O.x')).toBe(typeO.field('x'));

  const typeE = schema.type('E') as EnumType;
  expect(schema.elementByCoordinate('E')).toBe(typeE);
  expect(schema.elementByCoordinate('E.FOO')).toBe(typeE.value('FOO'));

  expect(schema.elementByCoordinate('Date')).toBe(schema.type('Date'));

  const directiveFoo = schema.directive('foo')!;
  expect(schema.elementByCoordinate('@foo')).toBe(directiveFoo);
  expect(schema.elementByCoordinate('@foo(bar:)')).toBe(directiveFoo.argument('bar'));

  expect(schema.elementByCoordinate('SomeType')).toBeUndefined();
  expect(schema.elementByCoordinate('T.f3')).toBeUndefined();
  expect(schema.elementByCoordinate('T.f1(y:)')).toBeUndefined();
  expect(schema.elementByCoordinate('I.j')).toBeUndefined();
  expect(schema.elementByCoordinate('I.j(x:)')).toBeUndefined();
  expect(schema.elementByCoordinate('O.z')).toBeUndefined();
  expect(schema.elementByCoordinate('@bar')).toBeUndefined();
  expect(schema.elementByCoordinate('@foo(unknown:)')).toBeUndefined();

  expect(() => schema.elementByCoordinate('foo bar')).toThrow();
  expect(() => schema.elementByCoordinate('@foo.bar')).toThrow();
  // Note that because 'O' is an input type, it's field can't have args
  expect(() => schema.elementByCoordinate('O.x(foo:)')).toThrow();
  // Note that because 'Date' is a scalar, it cannot have fields
  expect(() => schema.elementByCoordinate('Date.bar')).toThrow();
})
