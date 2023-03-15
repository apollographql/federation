// write a jest test for directiveCompositionRules.ts

import { DirectiveLocation } from 'graphql';
import gql from 'graphql-tag';
import { Directive, DirectiveDefinition, FieldDefinition, ListType, NonNullType, ObjectType, Schema } from '../definitions';
import { DirectiveCompositionEntry, FederationDirectiveCompositionManager, FieldPropagationStrategy } from '../directiveCompositionRules';
import { buildSubgraph } from '../federation';

describe('directive composition entry tests', () => {
  it.each([
    DirectiveLocation.INTERFACE,
    DirectiveLocation.SCHEMA,
    DirectiveLocation.INTERFACE,
    DirectiveLocation.UNION,
    DirectiveLocation.ENUM_VALUE,
    DirectiveLocation.INPUT_OBJECT,
  ])('directive has invalid locations', (location) => {
    const definition = new DirectiveDefinition('foo');
    definition.addLocations(location);
    expect(() => {
      new DirectiveCompositionEntry(
        definition,
      );
    }).toThrowError(`Directive @foo has unsupported locations: ${location}.`);
  });

  it('collapse directive is repeatable', () => {
    const definition = new DirectiveDefinition('foo');
    definition.addLocations(DirectiveLocation.FIELD_DEFINITION);
    definition.repeatable = true;
    expect(() => {
      new DirectiveCompositionEntry(
        definition,
      );
    }).toThrowError(`Directive @foo is repeatable. Repeatable directives are not supported yet.`);
  });

  it('composition entry specifies unknown arguments', () => {
    const definition = new DirectiveDefinition('foo');
    definition.addLocations(DirectiveLocation.FIELD_DEFINITION);
    expect(() => {
      new DirectiveCompositionEntry(
        definition,
        new Map([['value', FieldPropagationStrategy.MAX]]),
      );
    }).toThrowError(`Directive @foo does not have an argument named value.`);
  });

  it('directive has arguments that are not specified in the field strategies', () => {
    const schema = new Schema();
    const definition = new DirectiveDefinition('foo');
    schema.addDirectiveDefinition(definition);
    definition.addLocations(DirectiveLocation.FIELD_DEFINITION);
    definition.addArgument('value', new NonNullType(schema.intType()));
    expect(() => {
      new DirectiveCompositionEntry(
        definition,
      );
    }).toThrowError(`Directive @foo has arguments that are not in the field strategies map.`);
  });

  it('directive has optional argument', () => {
    const schema = new Schema();
    const definition = new DirectiveDefinition('foo');
    schema.addDirectiveDefinition(definition);
    definition.addLocations(DirectiveLocation.FIELD_DEFINITION);
    definition.addArgument('value', schema.intType());
    expect(() => {
      new DirectiveCompositionEntry(
        definition,
        new Map([['value', FieldPropagationStrategy.MAX]]),
      );
    }).toThrowError(`Directive @foo has one or more optional arguments. Optional arguments are not supported yet.`);
  });

  it.each([
    [FieldPropagationStrategy.MAX, (schema: Schema) => schema.stringType(), 'Int!'],
    [FieldPropagationStrategy.MIN, (schema: Schema) => schema.stringType(), 'Int!'],
    [FieldPropagationStrategy.SUM, (schema: Schema) => schema.stringType(), 'Int!'],
    [FieldPropagationStrategy.AND, (schema: Schema) => schema.intType(), 'Boolean!'],
    [FieldPropagationStrategy.OR, (schema: Schema) => schema.intType(), 'Boolean!'],
    [FieldPropagationStrategy.INTERSECTION, (schema: Schema) => schema.intType(), '[T]!'],
    [FieldPropagationStrategy.UNION, (schema: Schema) => schema.intType(), '[T]!'],
  ])('make sure that field propagation strategies match their types', (strategy, getType, typeAsString) => {
    const schema = new Schema();
    const definition = new DirectiveDefinition('foo');
    schema.addDirectiveDefinition(definition);
    definition.addLocations(DirectiveLocation.FIELD_DEFINITION);
    definition.addArgument('value', new NonNullType(getType(schema)));
    expect(() => {
      new DirectiveCompositionEntry(
        definition,
        new Map([['value', strategy]]),
      );
    }).toThrowError(`Directive @foo has a field strategy of ${strategy} for argument value, but the argument is not of type ${typeAsString}`);
  });
});

describe('field directive processing tests', () => {
  const getPrimitiveType = (schema: Schema, type: string) => {
    if (type === 'int') {
      return schema.intType();
    } else if (type === 'float') {
      return schema.floatType();
    } else if (type === 'string') {
      return schema.stringType();
    }
    throw new Error('getPrimitiveType: unknown type');
  }

  it.each([
    [FieldPropagationStrategy.SUM, 1, 3, [ { value: 4 } ], 'int'],
    [FieldPropagationStrategy.MAX, 1, 3, [ { value: 3 } ], 'int'],
    [FieldPropagationStrategy.MIN, 1, 3, [ { value: 1 } ], 'int'],
    [FieldPropagationStrategy.SUM, 0.5, 3.5, [ { value: 4 } ], 'float'],
    [FieldPropagationStrategy.MAX, 0.5, 3.5, [ { value: 3.5 } ], 'float'],
    [FieldPropagationStrategy.MIN, 0.5, 3.5, [ { value: 0.5 } ], 'float'],
  ])('combination of directives (int/float)', (strategy, a, b, expectedResult, type) => {
    const schema = new Schema();
    const query = new ObjectType('Query');
    schema.addType(query);
    query.addField('a', getPrimitiveType(schema, type));

    const definition = new DirectiveDefinition('foo');
    schema.addDirectiveDefinition(definition);
    definition.addLocations(DirectiveLocation.FIELD_DEFINITION);
    definition.addArgument('value', new NonNullType(schema.intType()));
    definition.repeatable = false;

    const entry = new DirectiveCompositionEntry(
      definition,
      new Map([['value', strategy]]),
    );

    query.fields()[0].applyDirective(definition, { name: 'value', value: a });
    query.fields()[0].applyDirective(definition, { name: 'value', value: b });
    const directives = query.fields()[0].appliedDirectives;

    expect(entry.processFieldDirectives(directives as Directive<any>[])).toEqual(expectedResult);
  });

  it.each([
    [FieldPropagationStrategy.AND, [false, false, true], [ { value: false } ]],
    [FieldPropagationStrategy.AND, [true, true, true], [ { value: true } ]],
    [FieldPropagationStrategy.OR, [false, false, false], [ { value: false } ]],
    [FieldPropagationStrategy.OR, [false, false, true], [ { value: true } ]],
  ])('combination of directives (bool)', (strategy, values, expectedResult) => {
    const schema = new Schema();
    const query = new ObjectType('Query');
    schema.addType(query);
    query.addField('a', schema.intType());

    const definition = new DirectiveDefinition('foo');
    schema.addDirectiveDefinition(definition);
    definition.addLocations(DirectiveLocation.FIELD_DEFINITION);
    definition.addArgument('value', new NonNullType(schema.booleanType()));
    definition.repeatable = false;

    const entry = new DirectiveCompositionEntry(
      definition,
      new Map([['value', strategy]]),
    );

    query.fields()[0].applyDirective(definition, { name: 'value', value: values[0] });
    query.fields()[0].applyDirective(definition, { name: 'value', value: values[1] });
    query.fields()[0].applyDirective(definition, { name: 'value', value: values[2] });
    const directives = query.fields()[0].appliedDirectives;

    expect(entry.processFieldDirectives(directives as Directive<any>[])).toEqual(expectedResult);
  });

  it('union field propagation strategy', () => {
    const schema = new Schema();
    const query = new ObjectType('Query');
    schema.addType(query);
    query.addField('a', schema.intType());

    const definition = new DirectiveDefinition('foo');
    schema.addDirectiveDefinition(definition);
    definition.addLocations(DirectiveLocation.FIELD_DEFINITION);
    definition.addArgument('value', new NonNullType(new ListType(schema.intType())));
    definition.repeatable = false;

    const entry = new DirectiveCompositionEntry(
      definition,
      new Map([['value', FieldPropagationStrategy.UNION]]),
    );

    query.fields()[0].applyDirective(definition, { name: 'value', value: [1,2] });
    query.fields()[0].applyDirective(definition, { name: 'value', value: [2] });
    query.fields()[0].applyDirective(definition, { name: 'value', value: [3] });
    const directives = query.fields()[0].appliedDirectives;

    expect(entry.processFieldDirectives(directives as Directive<any>[])).toEqual([
      { value: [1,2,3] },
    ]);
  });

  it('intersection field propagation strategy', () => {
    const schema = new Schema();
    const query = new ObjectType('Query');
    schema.addType(query);
    query.addField('a', schema.intType());

    const definition = new DirectiveDefinition('foo');
    schema.addDirectiveDefinition(definition);
    definition.addLocations(DirectiveLocation.FIELD_DEFINITION);
    definition.addArgument('value', new NonNullType(new ListType(schema.intType())));
    definition.repeatable = false;

    const entry = new DirectiveCompositionEntry(
      definition,
      new Map([['value', FieldPropagationStrategy.INTERSECTION]]),
    );

    query.fields()[0].applyDirective(definition, { name: 'value', value: [1,2,4] });
    query.fields()[0].applyDirective(definition, { name: 'value', value: [2,4,7] });
    query.fields()[0].applyDirective(definition, { name: 'value', value: [2,3,4,9] });
    const directives = query.fields()[0].appliedDirectives;

    expect(entry.processFieldDirectives(directives as Directive<any>[])).toEqual([
      { value: [2,4] },
    ]);
  });
});

describe('test with full federated schemas', () => {
  it('test through composition manager with red herring renamed directive', () => {
    const subgraph1 = buildSubgraph(
      'Subgraph1',
      'https://Subgraph1',
      gql`
        extend schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        @link(
          url: "https://specs.apollo.dev/foo/v0.1"
          import: ["@foo"]
        )

        directive @foo(value: Int!, otherValue: Int!) on FIELD_DEFINITION

        type Query {
          a: Int @foo(value: 1, otherValue: 1)
        }
      `);

    const subgraph2 = buildSubgraph(
      'Subgraph2',
      'https://Subgraph2',
      gql`
        extend schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        @link(
          url: "https://specs.apollo.dev/foo/v0.1"
          import: [{ name: "@foo", as: "@bar" }]
        )

        directive @bar(value: Int!, otherValue: Int!) on FIELD_DEFINITION
        directive @foo(value: Int!) on FIELD_DEFINITION

        type Query {
          a: Int @bar(value: 2, otherValue: 7) @foo(value: 3)
        }
      `);

      const supergraph = buildSubgraph(
        'Supergraph',
        'https://Supergraph',
        gql`
          extend schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(
            url: "https://specs.apollo.dev/foo/v0.1"
            import: ["@foo"]
          )

          directive @foo(value: Int!, otherValue: Int!) on FIELD_DEFINITION

          type Query {
            a: Int
          }
        `);

    const entry = new DirectiveCompositionEntry(
      supergraph.schema.directive('foo') as any,
      new Map([['value', FieldPropagationStrategy.SUM], ['otherValue', FieldPropagationStrategy.MAX]]),
    );

    const mgr = new FederationDirectiveCompositionManager([subgraph1.schema, subgraph2.schema], [entry])
    mgr.mergeSchemaElements([
      subgraph1.schema.elementByCoordinate('Query.a') as FieldDefinition<any>,
      subgraph2.schema.elementByCoordinate('Query.a') as FieldDefinition<any>,
    ], supergraph.schema.elementByCoordinate('Query.a') as FieldDefinition<any>);
    const appliedDirectives = (supergraph.schema.elementByCoordinate('Query.a') as FieldDefinition<any>).appliedDirectives;
    expect(appliedDirectives.toString()).toBe('@foo(value: 3, otherValue: 7)');
  });

  it('test through composition manager with red herring renamed directive on OBJECT', () => {
    const subgraph1 = buildSubgraph(
      'Subgraph1',
      'https://Subgraph1',
      gql`
        extend schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        @link(
          url: "https://specs.apollo.dev/foo/v0.1"
          import: ["@foo"]
        )

        directive @foo(value: Int!, otherValue: Int!) on OBJECT

        type Query @foo(value: 1, otherValue: 1) {
          a: Int
        }
      `);

    const subgraph2 = buildSubgraph(
      'Subgraph2',
      'https://Subgraph2',
      gql`
        extend schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        @link(
          url: "https://specs.apollo.dev/foo/v0.1"
          import: [{ name: "@foo", as: "@bar" }]
        )

        directive @bar(value: Int!, otherValue: Int!) on OBJECT
        directive @foo(value: Int!) on OBJECT

        type Query @bar(value: 2, otherValue: 7) @foo(value: 3) {
          a: Int
        }
      `);

      const supergraph = buildSubgraph(
        'Supergraph',
        'https://Supergraph',
        gql`
          extend schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(
            url: "https://specs.apollo.dev/foo/v0.1"
            import: ["@foo"]
          )

          directive @foo(value: Int!, otherValue: Int!) on OBJECT

          type Query {
            a: Int
          }
        `);

    const entry = new DirectiveCompositionEntry(
      supergraph.schema.directive('foo') as any,
      new Map([['value', FieldPropagationStrategy.SUM], ['otherValue', FieldPropagationStrategy.MAX]]),
    );

    const mgr = new FederationDirectiveCompositionManager([subgraph1.schema, subgraph2.schema], [entry])
    mgr.mergeSchemaElements([
      subgraph1.schema.elementByCoordinate('Query') as ObjectType,
      subgraph2.schema.elementByCoordinate('Query') as ObjectType,
    ], supergraph.schema.elementByCoordinate('Query') as ObjectType);
    const appliedDirectives = (supergraph.schema.elementByCoordinate('Query') as ObjectType).appliedDirectives;
    expect(appliedDirectives.toString()).toBe('@foo(value: 3, otherValue: 7)');
  });
});
