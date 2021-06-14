import {
  AnySchema,
  AnyObjectType,
  AnySchemaElement,
  AnyType,
  Schema,
  MutableSchema,
  MutableObjectType,
  MutableType,
  ObjectType,
  Type,
  BuiltIns
} from '../../dist/definitions';
import {
  printSchema
} from '../../dist/print';
import {
  federationBuiltIns
} from '../../dist/federation';

function expectObjectType(type: Type | MutableType | undefined): asserts type is ObjectType | MutableObjectType {
  expect(type).toBeDefined();
  expect(type!.kind).toBe('ObjectType');
}

declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveField(name: string, type?: AnyType): R;
      toHaveDirective(name: string, args?: Map<string, any>): R;
    }
  }
}

expect.extend({
  toHaveField(parentType: AnyObjectType, name: string, type?: AnyType) {
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
    if (type && field.type() != type) {
      return {
        message: () => `Expected field ${parentType}.${name} to have type ${type} but got type ${field.type()}`,
        pass: false
      };
    }
    return {
      message: () => `Expected ${parentType} not to have field ${name} but it does (${field})`,
      pass: true
    }
  },

  toHaveDirective(element: AnySchemaElement, name: string, args?: Map<string, any>) {
    const directives = element.appliedDirective(name);
    if (directives.length == 0) {
      return {
        message: () => `Cannot find directive @${name} applied to element ${element} (whose applied directives are [${element.appliedDirectives().join(', ')}]`,
        pass: false
      };
    }
    if (!args) {
      return {
        message: () => `Expected directive @${name} to not be applied to ${element} but it is`,
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
      message: () => `Element ${element} has application of directive @${name} but not with the requested arguments. Got applications: [${directives.join(', ')}]`,
      pass: false
    }
  }
});

test('building a simple mutable schema programatically and converting to immutable', () => {
  const mutDoc = MutableSchema.empty(federationBuiltIns);
  const mutQueryType = mutDoc.schemaDefinition.setRoot('query', mutDoc.addObjectType('Query'));
  const mutTypeA = mutDoc.addObjectType('A');
  mutQueryType.addField('a', mutTypeA);
  mutTypeA.addField('q', mutQueryType);
  mutTypeA.applyDirective('inaccessible');
  mutTypeA.applyDirective('key', new Map([['fields', 'a']]));

  // Sanity check
  expect(mutQueryType).toHaveField('a', mutTypeA);
  expect(mutTypeA).toHaveField('q', mutQueryType);
  expect(mutTypeA).toHaveDirective('inaccessible');
  expect(mutTypeA).toHaveDirective('key', new Map([['fields', 'a']]));

  const doc = mutDoc.toImmutable();
  const queryType = doc.type('Query'); 
  const typeA = doc.type('A'); 
  expect(queryType).toBe(doc.schemaDefinition.root('query'));
  expectObjectType(queryType);
  expectObjectType(typeA);
  expect(queryType).toHaveField('a', typeA);
  expect(typeA).toHaveField('q', queryType);
  expect(typeA).toHaveDirective('inaccessible');
  expect(typeA).toHaveDirective('key', new Map([['fields', 'a']]));
});

function parseAndValidateTestSchema<S extends AnySchema>(parser: (source: string, builtIns: BuiltIns) => S): S {
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
  const doc = parser(sdl, federationBuiltIns);

  const queryType = doc.type('MyQuery')!;
  const typeA = doc.type('A')!;
  expectObjectType(queryType);
  expectObjectType(typeA);
  expect(doc.schemaDefinition.root('query')).toBe(queryType);
  expect(queryType).toHaveField('a', typeA);
  const f2 = typeA.field('f2');
  expect(f2).toHaveDirective('inaccessible');
  expect(printSchema(doc)).toBe(sdl);
  return doc;
}


test('parse immutable schema', () => {
  parseAndValidateTestSchema(Schema.parse);
});

test('parse mutable schema and modify', () => {
  const doc = parseAndValidateTestSchema(MutableSchema.parse);
  const typeA = doc.type('A');
  expectObjectType(typeA);
  expect(typeA).toHaveField('f1');
  typeA.field('f1')!.remove();
  expect(typeA).not.toHaveField('f1');
});

test('removal of all directives of a schema', () => {
  const doc = MutableSchema.parse(`
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

  for (const element of doc.allSchemaElement()) {
    element.appliedDirectives().forEach(d => d.remove());
  }

  expect(printSchema(doc)).toBe(
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
  const doc = MutableSchema.parse(`
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

  for (const element of doc.allSchemaElement()) {
    if (element.appliedDirective('inaccessible').length > 0) {
      element.remove();
    }
  }

  expect(printSchema(doc)).toBe(
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
