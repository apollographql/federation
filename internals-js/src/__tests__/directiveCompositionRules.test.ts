// write a jest test for directiveCompositionRules.ts

import { DirectiveLocation } from 'graphql';
import { Directive, DirectiveDefinition, ListType, NonNullType, ObjectType, Schema } from '../definitions';
import { DirectiveCompositionEntry, DirectiveCompositionStrategy, DirectivePropagationStrategy, FederationDirectiveCompositionManager, FieldPropagationStrategy } from '../directiveCompositionRules';

describe('directive composition entry tests', () => {
  it.each([
    DirectiveLocation.INTERFACE,
    DirectiveLocation.SCHEMA,
    DirectiveLocation.SCALAR,
    DirectiveLocation.ARGUMENT_DEFINITION,
    DirectiveLocation.INTERFACE,
    DirectiveLocation.UNION,
    DirectiveLocation.ENUM,
    DirectiveLocation.ENUM_VALUE,
    DirectiveLocation.INPUT_OBJECT,
    DirectiveLocation.INPUT_FIELD_DEFINITION,
  ])('directive has invalid locations', (location) => {
    const definition = new DirectiveDefinition('foo');
    definition.addLocations(location);
    expect(() => {
      new DirectiveCompositionEntry(
        definition,
        DirectiveCompositionStrategy.COLLAPSE,
        DirectivePropagationStrategy.INHERIT_FROM_OBJECT
      );
    }).toThrowError(`Directive @foo has unsupported locations: ${location}.`);
  });

  it.each([
    DirectiveCompositionStrategy.COLLAPSE,
    DirectiveCompositionStrategy.COLLAPSE_FROM_ALL,
  ])('collapse directive is repeatable', (strategy) => {
    const definition = new DirectiveDefinition('foo');
    definition.addLocations(DirectiveLocation.FIELD_DEFINITION);
    definition.repeatable = true;
    expect(() => {
      new DirectiveCompositionEntry(
        definition,
        strategy,
        DirectivePropagationStrategy.INHERIT_FROM_OBJECT
      );
    }).toThrowError(`Directive @foo is repeatable, but its composition strategy is ${strategy}.`);
  });

  it(('propagation strategy is inherit from object and directive is repeatable'), () => {
    const definition = new DirectiveDefinition('foo');
    definition.addLocations(DirectiveLocation.FIELD_DEFINITION);
    definition.repeatable = true;
    expect(() => {
      new DirectiveCompositionEntry(
        definition,
        DirectiveCompositionStrategy.REMOVE_DUPLICATES,
        DirectivePropagationStrategy.INHERIT_FROM_OBJECT
      );
    }).toThrowError(`Directive @foo is repeatable, but its propagation strategy is inheritFromObject.`);
  });

  it('composition entry specifies unknown arguments', () => {
    const definition = new DirectiveDefinition('foo');
    definition.addLocations(DirectiveLocation.FIELD_DEFINITION);
    expect(() => {
      new DirectiveCompositionEntry(
        definition,
        DirectiveCompositionStrategy.REMOVE_DUPLICATES,
        DirectivePropagationStrategy.INHERIT_FROM_OBJECT,
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
        DirectiveCompositionStrategy.REMOVE_DUPLICATES,
        DirectivePropagationStrategy.INHERIT_FROM_OBJECT,
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
        DirectiveCompositionStrategy.REMOVE_DUPLICATES,
        DirectivePropagationStrategy.INHERIT_FROM_OBJECT,
        new Map([['value', FieldPropagationStrategy.MAX]]),
      );
    }).toThrowError(`Directive @foo has one or more optional arguments. Optional arguments are not supported yet.`);
  });

  it.each([
    [FieldPropagationStrategy.MAX, (schema: Schema) => schema.stringType(), 'Int!'],
    [FieldPropagationStrategy.MIN, (schema: Schema) => schema.stringType(), 'Int!'],
    [FieldPropagationStrategy.SUM, (schema: Schema) => schema.stringType(), 'Int!'],
    [FieldPropagationStrategy.AVERAGE, (schema: Schema) => schema.stringType(), 'Int!'],
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
        DirectiveCompositionStrategy.REMOVE_DUPLICATES,
        DirectivePropagationStrategy.INHERIT_FROM_OBJECT,
        new Map([['value', strategy]]),
      );
    }).toThrowError(`Directive @foo has a field strategy of ${strategy} for argument value, but the argument is not of type ${typeAsString}`);
  });

  it('make sure that FIELD_DEFINITION is a valid location if INHERIT_FROM_OBJECT is used', () => {
    const schema = new Schema();
    const definition = new DirectiveDefinition('foo');
    schema.addDirectiveDefinition(definition);
    definition.addLocations(DirectiveLocation.OBJECT);
    expect(() => {
      new DirectiveCompositionEntry(
        definition,
        DirectiveCompositionStrategy.REMOVE_DUPLICATES,
        DirectivePropagationStrategy.INHERIT_FROM_OBJECT,
      );
    }).toThrowError(`Directive @foo is marked as inheritFromObject, but FIELD_DEFINITION is not one of its locations.`);
  });

});

describe('field directive processing tests', () => {
  it.each([
    [FieldPropagationStrategy.EXACT, [ { value: 1 }, { value: 2 } ]],
  ])('match exact should not combine directives', (strategy, expectedResult) => {
    const schema = new Schema();
    const query = new ObjectType('Query');
    schema.addType(query);
    query.addField('a', schema.intType());

    const definition = new DirectiveDefinition('foo');
    schema.addDirectiveDefinition(definition);
    definition.addLocations(DirectiveLocation.FIELD_DEFINITION);
    definition.addArgument('value', new NonNullType(schema.intType()));
    definition.repeatable = true;

    const entry = new DirectiveCompositionEntry(
      definition,
      DirectiveCompositionStrategy.REMOVE_DUPLICATES,
      DirectivePropagationStrategy.CONSISTENT_LOCATION,
      new Map([['value', strategy]]),
    );

    query.fields()[0].applyDirective(definition, { name: 'value', value: 1 });
    query.fields()[0].applyDirective(definition, { name: 'value', value: 2 });
    const directives = query.fields()[0].appliedDirectives;

    expect(entry.processFieldDirectives(directives as Directive<any>[])).toEqual(expectedResult);
  });

  it.each([
    [FieldPropagationStrategy.SUM, [ { value: 4 } ]],
    [FieldPropagationStrategy.MAX, [ { value: 3 } ]],
    [FieldPropagationStrategy.MIN, [ { value: 1 } ]],
    [FieldPropagationStrategy.AVERAGE, [ { value: 2 } ]],
  ])('combination of directives (int)', (strategy, expectedResult) => {
    const schema = new Schema();
    const query = new ObjectType('Query');
    schema.addType(query);
    query.addField('a', schema.intType());

    const definition = new DirectiveDefinition('foo');
    schema.addDirectiveDefinition(definition);
    definition.addLocations(DirectiveLocation.FIELD_DEFINITION);
    definition.addArgument('value', new NonNullType(schema.intType()));
    definition.repeatable = true;

    const entry = new DirectiveCompositionEntry(
      definition,
      DirectiveCompositionStrategy.REMOVE_DUPLICATES,
      DirectivePropagationStrategy.CONSISTENT_LOCATION,
      new Map([['value', strategy]]),
    );

    query.fields()[0].applyDirective(definition, { name: 'value', value: 1 });
    query.fields()[0].applyDirective(definition, { name: 'value', value: 3 });
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
    definition.repeatable = true;

    const entry = new DirectiveCompositionEntry(
      definition,
      DirectiveCompositionStrategy.REMOVE_DUPLICATES,
      DirectivePropagationStrategy.CONSISTENT_LOCATION,
      new Map([['value', strategy]]),
    );

    query.fields()[0].applyDirective(definition, { name: 'value', value: values[0] });
    query.fields()[0].applyDirective(definition, { name: 'value', value: values[1] });
    query.fields()[0].applyDirective(definition, { name: 'value', value: values[2] });
    const directives = query.fields()[0].appliedDirectives;

    expect(entry.processFieldDirectives(directives as Directive<any>[])).toEqual(expectedResult);
  });

  it('more complicated example of combinations', () => {
    const schema = new Schema();
    const query = new ObjectType('Query');
    schema.addType(query);
    query.addField('a', schema.intType());

    const definition = new DirectiveDefinition('foo');
    schema.addDirectiveDefinition(definition);
    definition.addLocations(DirectiveLocation.FIELD_DEFINITION);
    definition.addArgument('value', new NonNullType(schema.intType()));
    definition.addArgument('otherValue', new NonNullType(schema.intType()));
    definition.addArgument('label', new NonNullType(schema.stringType()));
    definition.repeatable = true;

    const entry = new DirectiveCompositionEntry(
      definition,
      DirectiveCompositionStrategy.REMOVE_DUPLICATES,
      DirectivePropagationStrategy.CONSISTENT_LOCATION,
      new Map([['value', FieldPropagationStrategy.SUM], ['otherValue', FieldPropagationStrategy.MAX], ['label', FieldPropagationStrategy.EXACT]]),
    );

    query.fields()[0].applyDirective(definition, { name: 'value', value: 1, otherValue: 1, label: 'a' });
    query.fields()[0].applyDirective(definition, { name: 'value', value: 1, otherValue: 2, label: 'b' });
    query.fields()[0].applyDirective(definition, { name: 'value', value: 1, otherValue: 3, label: 'c' });
    query.fields()[0].applyDirective(definition, { name: 'value', value: 1, otherValue: 4, label: 'a' });
    query.fields()[0].applyDirective(definition, { name: 'value', value: 1, otherValue: 5, label: 'a' });
    query.fields()[0].applyDirective(definition, { name: 'value', value: 1, otherValue: 6, label: 'b' });
    query.fields()[0].applyDirective(definition, { name: 'value', value: 1, otherValue: 7, label: 'c' });
    query.fields()[0].applyDirective(definition, { name: 'value', value: 1, otherValue: 8, label: 'c' });
    query.fields()[0].applyDirective(definition, { name: 'value', value: 1, otherValue: 9, label: 'c' });
    const directives = query.fields()[0].appliedDirectives;

    expect(entry.processFieldDirectives(directives as Directive<any>[])).toEqual([
      { value: 3, otherValue: 5, label: 'a'},
      { value: 2, otherValue: 6, label: 'b'},
      { value: 4, otherValue: 9, label: 'c'},
    ]);
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
    definition.repeatable = true;

    const entry = new DirectiveCompositionEntry(
      definition,
      DirectiveCompositionStrategy.REMOVE_DUPLICATES,
      DirectivePropagationStrategy.CONSISTENT_LOCATION,
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
    definition.repeatable = true;

    const entry = new DirectiveCompositionEntry(
      definition,
      DirectiveCompositionStrategy.REMOVE_DUPLICATES,
      DirectivePropagationStrategy.CONSISTENT_LOCATION,
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
  it('test through composition manager', () => {
    const schema1 = new Schema();
    const query1 = new ObjectType('Query');
    schema1.addType(query1);
    query1.addField('a', schema1.intType());

    const schema2 = new Schema();
    const query2 = new ObjectType('Query');
    schema2.addType(query2);
    query2.addField('a', schema2.intType());

    const supergraphSchema = new Schema();
    const supergraphQuery = new ObjectType('Query');
    supergraphSchema.addType(supergraphQuery);
    supergraphQuery.addField('a', supergraphSchema.intType());

    const generateFooDirectiveDefinitionForSchema = (schema: Schema) => {
      const definition = new DirectiveDefinition('foo');
      schema.addDirectiveDefinition(definition);
      definition.addLocations(DirectiveLocation.FIELD_DEFINITION);
      definition.addArgument('value', new NonNullType(schema.intType()));
      definition.addArgument('otherValue', new NonNullType(schema.intType()));
      definition.addArgument('label', new NonNullType(schema.stringType()));
      definition.repeatable = true;
      return definition;
    };

    const definition1 = generateFooDirectiveDefinitionForSchema(schema1);
    const definition2 = generateFooDirectiveDefinitionForSchema(schema2);
    const supergraphDefinition = generateFooDirectiveDefinitionForSchema(supergraphSchema);

    query1.fields()[0].applyDirective(definition1, { name: 'value', value: 1, otherValue: 1, label: 'a' });
    query2.fields()[0].applyDirective(definition2, { name: 'value', value: 2, otherValue: 7, label: 'a' });
    query2.fields()[0].applyDirective(definition2, { name: 'value', value: 4, otherValue: 4, label: 'b' });

    const entry = new DirectiveCompositionEntry(
      supergraphDefinition,
      DirectiveCompositionStrategy.REMOVE_DUPLICATES,
      DirectivePropagationStrategy.CONSISTENT_LOCATION,
      new Map([['value', FieldPropagationStrategy.SUM], ['otherValue', FieldPropagationStrategy.MAX], ['label', FieldPropagationStrategy.EXACT]]),
    );

    const mgr = new FederationDirectiveCompositionManager([schema1, schema2], [entry])
    mgr.mergeField([query1.fields()[0], query2.fields()[0]], supergraphQuery.fields()[0]);
    const appliedDirectives = supergraphQuery.fields()[0].appliedDirectives;
    expect(appliedDirectives.toString()).toBe('@foo(value: 3, otherValue: 7, label: "a"),@foo(value: 4, otherValue: 4, label: "b")');
  });

  it('mergeObject without propagation to fields', () => {
    const schema1 = new Schema();
    const query1 = new ObjectType('Query');
    schema1.addType(query1);
    query1.addField('a', schema1.intType());

    const schema2 = new Schema();
    const query2 = new ObjectType('Query');
    schema2.addType(query2);
    query2.addField('a', schema2.intType());

    const supergraphSchema = new Schema();
    const supergraphQuery = new ObjectType('Query');
    supergraphSchema.addType(supergraphQuery);
    supergraphQuery.addField('a', supergraphSchema.intType());

    const generateFooDirectiveDefinitionForSchema = (schema: Schema) => {
      const definition = new DirectiveDefinition('foo');
      schema.addDirectiveDefinition(definition);
      definition.addLocations(DirectiveLocation.FIELD_DEFINITION, DirectiveLocation.OBJECT);
      definition.addArgument('label', new NonNullType(schema.stringType()));
      definition.repeatable = true;
      return definition;
    };

    const definition1 = generateFooDirectiveDefinitionForSchema(schema1);
    const definition2 = generateFooDirectiveDefinitionForSchema(schema2);
    const supergraphDefinition = generateFooDirectiveDefinitionForSchema(supergraphSchema);

    query1.applyDirective(definition1, { label: 'a' });
    query2.applyDirective(definition2, { label: 'b' });

    const entry = new DirectiveCompositionEntry(
      supergraphDefinition,
      DirectiveCompositionStrategy.REMOVE_DUPLICATES,
      DirectivePropagationStrategy.CONSISTENT_LOCATION,
      new Map([['label', FieldPropagationStrategy.EXACT]]),
    );

    const mgr = new FederationDirectiveCompositionManager([schema1, schema2], [entry])
    mgr.mergeObject([query1, query2], supergraphQuery);
    const appliedDirectives = supergraphQuery.appliedDirectives;
    expect(appliedDirectives.toString()).toBe('@foo(label: "a"),@foo(label: "b")');
    expect(supergraphQuery.fields()[0].appliedDirectives.toString()).toBe('');
  });

  it('mergeObject with propagation to fields', () => {
    const schema1 = new Schema();
    const query1 = new ObjectType('Query');
    schema1.addType(query1);
    query1.addField('a', schema1.intType());

    const schema2 = new Schema();
    const query2 = new ObjectType('Query');
    schema2.addType(query2);
    query2.addField('a', schema2.intType());

    const supergraphSchema = new Schema();
    const supergraphQuery = new ObjectType('Query');
    supergraphSchema.addType(supergraphQuery);
    supergraphQuery.addField('a', supergraphSchema.intType());

    const generateFooDirectiveDefinitionForSchema = (schema: Schema) => {
      const definition = new DirectiveDefinition('foo');
      schema.addDirectiveDefinition(definition);
      definition.addLocations(DirectiveLocation.FIELD_DEFINITION, DirectiveLocation.OBJECT);
      definition.addArgument('value', new NonNullType(schema.intType()));
      return definition;
    };

    const definition1 = generateFooDirectiveDefinitionForSchema(schema1);
    const definition2 = generateFooDirectiveDefinitionForSchema(schema2);
    const supergraphDefinition = generateFooDirectiveDefinitionForSchema(supergraphSchema);

    query1.applyDirective(definition1, { value: 1 });
    query1.fields()[0].applyDirective(definition1, { value: 6 });
    query2.applyDirective(definition2, { value: 2 });

    const entry = new DirectiveCompositionEntry(
      supergraphDefinition,
      DirectiveCompositionStrategy.REMOVE_DUPLICATES,
      DirectivePropagationStrategy.INHERIT_FROM_OBJECT,
      new Map([['value', FieldPropagationStrategy.SUM]]),
    );

    const mgr = new FederationDirectiveCompositionManager([schema1, schema2], [entry])
    mgr.mergeObject([query1, query2], supergraphQuery);
    const appliedDirectives = supergraphQuery.appliedDirectives;
    expect(appliedDirectives.toString()).toBe('@foo(value: 3)');

    mgr.mergeField([query1.fields()[0], query2.fields()[0]], supergraphQuery.fields()[0]);

    expect(supergraphQuery.fields()[0].appliedDirectives.toString()).toBe('@foo(value: 8)');
  });
});
