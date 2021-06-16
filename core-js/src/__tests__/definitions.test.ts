import {
  Schema,
  ObjectType,
  Type,
  DirectiveDefinition,
  InterfaceType,
  SchemaElement,
  EnumType
} from '../../dist/definitions';
import { printSchema } from '../../dist/print';
import { buildSchema } from '../../dist/buildSchema';
import { federationBuiltIns } from '../../dist/federation';

function expectObjectType(type?: Type): asserts type is ObjectType {
  expect(type).toBeDefined();
  expect(type!.kind).toBe('ObjectType');
}

function expectInterfaceType(type?: Type): asserts type is InterfaceType {
  expect(type).toBeDefined();
  expect(type!.kind).toBe('InterfaceType');
}

function expectEnumType(type?: Type): asserts type is EnumType {
  expect(type).toBeDefined();
  expect(type!.kind).toBe('EnumType');
}

declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveField(name: string, type?: Type): R;
      toHaveDirective(directive: DirectiveDefinition, args?: Map<string, any>): R;
    }
  }
}

expect.extend({
  toHaveField(parentType: ObjectType | InterfaceType, name: string, type?: Type) {
    const field = parentType.field(name);
    if (!field) {
      return {
        message: () => `Cannot find field '${name}' in Object Type ${parentType} with fields [${[...parentType.fields.keys()]}]`,
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

  toHaveDirective(element: SchemaElement<any, any>, definition: DirectiveDefinition, args?: Map<string, any>) {
    const directives = element.appliedDirective(definition as any);
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
          message: () => `Expected directive ${directive.name} applied to ${element} to have arguments ${args} but got ${directive.arguments}`,
          pass: true
        };
      }
    }
    return {
      message: () => `Element ${element} has application of directive @${definition} but not with the requested arguments. Got applications: [${directives.join(', ')}]`,
      pass: false
    }
  }
});

test('building a simple schema programatically', () => {
  const schema = new Schema(federationBuiltIns);
  const queryType = schema.schemaDefinition.setRoot('query', schema.addType(new ObjectType('Query')));
  const typeA = schema.addType(new ObjectType('A'));
  const inaccessible = schema.directive('inaccessible')!;
  const key = schema.directive('key')!;

  queryType.addField('a', typeA);
  typeA.addField('q', queryType);
  typeA.applyDirective(inaccessible);
  typeA.applyDirective(key, new Map([['fields', 'a']]));

  expect(queryType).toBe(schema.schemaDefinition.root('query'));
  expect(queryType).toHaveField('a', typeA);
  expect(typeA).toHaveField('q', queryType);
  expect(typeA).toHaveDirective(inaccessible);
  expect(typeA).toHaveDirective(key, new Map([['fields', 'a']]));
});


test('parse schema and modify', () => {
  const sdl =
`schema {
  query: MyQuery
}

type A {
  f1(x: Int @inaccessible): String
  f2: String @inaccessible
}

type MyQuery {
  a: A
  b: Int
}`;
  const schema = buildSchema(sdl, federationBuiltIns);

  const queryType = schema.type('MyQuery')!;
  const typeA = schema.type('A')!;
  expectObjectType(queryType);
  expectObjectType(typeA);
  expect(schema.schemaDefinition.root('query')).toBe(queryType);
  expect(queryType).toHaveField('a', typeA);
  const f2 = typeA.field('f2');
  expect(f2).toHaveDirective(schema.directive('inaccessible')!);
  expect(printSchema(schema)).toBe(sdl);

  expect(typeA).toHaveField('f1');
  typeA.field('f1')!.remove();
  expect(typeA).not.toHaveField('f1');
});

test('removal of all directives of a schema', () => {
  const schema = buildSchema(`
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

    directive @foo on SCHEMA | FIELD_DEFINITION
    directive @foobar on UNION
    directive @bar on ARGUMENT_DEFINITION
  `, federationBuiltIns);

  for (const element of schema.allSchemaElement()) {
    element.appliedDirectives.forEach(d => d.remove());
  }

  expect(printSchema(schema)).toBe(
`directive @foo on SCHEMA | FIELD_DEFINITION

directive @foobar on UNION

directive @bar on ARGUMENT_DEFINITION

type A {
  a1: String
  a2: [Int]
}

type B {
  b: String
}

type Query {
  a(id: String): A
}

union U = A | B`);
});

test('removal of all inacessible elements of a schema', () => {
  const schema = buildSchema(`
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

    directive @foo on SCHEMA | FIELD_DEFINITION
    directive @bar on ARGUMENT_DEFINITION
  `, federationBuiltIns);

  for (const element of schema.allSchemaElement()) {
    if (element.appliedDirective(schema.directive('inaccessible')!).length > 0) {
      element.remove();
    }
  }

  expect(printSchema(schema)).toBe(
`schema @foo {
  query: Query
}

directive @foo on SCHEMA | FIELD_DEFINITION

directive @bar on ARGUMENT_DEFINITION

type A {
  a2: [Int]
}

type Query {
  a(id: String @bar): A
}`);
});

test('handling of interfaces', () => {
  const schema = buildSchema(`
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

  expect(printSchema(schema)).toBe(
`interface I {
  a: Int
  b: String
}

type Query {
  bestIs: [I!]!
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
  const schema = buildSchema(`
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
