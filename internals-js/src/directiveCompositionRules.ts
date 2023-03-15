import { DirectiveLocation } from 'graphql';
import { Directive, DirectiveDefinition, FieldDefinition, NamedSchemaElement, ObjectType, Schema } from './definitions'
import { assert, assertUnreachable, isDefined, isNotNull } from './utils';

export enum FieldPropagationStrategy {
  MAX = 'max',
  MIN = 'min',
  SUM = 'sum',
  AND = 'and',
  OR = 'or',
  INTERSECTION = 'intersection',
  UNION = 'union',
}

const SUPPORTED_LOCATIONS = [
  DirectiveLocation.FIELD_DEFINITION,
  DirectiveLocation.OBJECT,
];

export class FederationDirectiveCompositionManager {
  private readonly directiveNameLookup: Map<string, string>[];
  constructor(
    readonly schemas: readonly Schema[],
    readonly entries: DirectiveCompositionEntry[],
  ) {
    // we need to create a map so that for each directive definition, we need to what the name is in each schema
    this.directiveNameLookup = new Array(schemas.length);

    for (let i = 0; i < schemas.length; i += 1) {
      this.directiveNameLookup[i] = new Map();
      for (const entry of entries) {
        const feature = schemas[i].coreFeatures?.sourceFeature(entry.definition);
        if (feature?.nameInFeature !== undefined) {
          this.directiveNameLookup[i].set(entry.definition.name, feature.feature.directiveNameInSchema(feature.nameInFeature));
        }
      }
    }
  }


  private getDirectiveNameInSchema(directiveName: string, schemaIndex: number) {
    return this.directiveNameLookup[schemaIndex].get(directiveName);
  }

  private mergeSchemaElement(sources: (NamedSchemaElement<any,any,any> | undefined)[], target: NamedSchemaElement<any,any,any>, entry: DirectiveCompositionEntry) {
    // get all directives from sources, then filter out sources where the
    // field isn't defined. If the directive is null, that means it does not exist on that field
    // for the given subgraph
    const directives = sources
      .map((source, idx) => {
        if (source === undefined) {
          return undefined;
        }
        console.log(entry.definition.name, 'is name');
        const directiveName = this.getDirectiveNameInSchema(entry.definition.name, idx);
        if (directiveName) {
          return source?.appliedDirectivesOf(directiveName);
        }
        return null;
      })
      .filter(isDefined);

    if (directives.length === 0) {
      return;
    }

    // next we need to flatten the directives into a single array
    const flattenedDirectives = directives
      .filter(isNotNull)
      .reduce((acc, val) => acc.concat(val), []);

    const argArrays = entry.processFieldDirectives(flattenedDirectives);
    argArrays.forEach(args => {
      target.applyDirective(entry.definition, args);
    });
  }

  mergeField(sources: (FieldDefinition<any> | undefined)[], target: FieldDefinition<any>) {
    this.entries.forEach(entry => {
      this.mergeSchemaElement(sources, target, entry);
    });
  }

  mergeObject(sources: (ObjectType | undefined)[], target: ObjectType) {
    sources.forEach((source) => {
      if (source === undefined) {
        return;
      }
    });
    this.entries.forEach(entry => {
      this.mergeSchemaElement(sources, target, entry);
    });
  }
}

export class DirectiveCompositionEntry {
  constructor(
    readonly definition: DirectiveDefinition,
    readonly fieldStrategies: Map<string, FieldPropagationStrategy> = new Map(),
  ) {
    if (definition.locations.some(loc => !SUPPORTED_LOCATIONS.includes(loc))) {
      throw new Error(`Directive @${definition.name} has unsupported locations: ${definition.locations.join(', ')}.`);
    }

    if (definition.repeatable) {
      throw new Error(`Directive @${definition.name} is repeatable. Repeatable directives are not supported yet.`);
    }

    if (!definition.arguments().every((arg) => fieldStrategies.has(arg.name))) {
      throw new Error(`Directive @${definition.name} has arguments that are not in the field strategies map.`)
    }

    // ensure that all defined arguments are mandatory. We don't know what to do with optional arguments yet
    if (!definition.arguments().every(arg => arg.type?.kind === 'NonNullType')) {
      throw new Error(`Directive @${definition.name} has one or more optional arguments. Optional arguments are not supported yet.`);
    }

    Array.from(fieldStrategies.entries()).forEach(([argumentName, strategy]) => {
      if (!definition.arguments().find(arg => arg.name === argumentName)) {
        throw new Error(`Directive @${definition.name} does not have an argument named ${argumentName}.`)
      }

      const type = definition.arguments().find(arg => arg.name === argumentName)?.type;
      assert(type, `Type does not exist for argument '${argumentName}'`);
      const typeString = type.toString();
      switch(strategy) {
        case FieldPropagationStrategy.MAX:
        case FieldPropagationStrategy.MIN:
        case FieldPropagationStrategy.SUM:
          assert(typeString === 'Int!', `Directive @${definition.name} has a field strategy of ${strategy} for argument ${argumentName}, but the argument is not of type Int!`);
          break;
        case FieldPropagationStrategy.AND:
        case FieldPropagationStrategy.OR:
          assert(typeString === 'Boolean!', `Directive @${definition.name} has a field strategy of ${strategy} for argument ${argumentName}, but the argument is not of type Boolean!`);
          break;
        case FieldPropagationStrategy.INTERSECTION:
        case FieldPropagationStrategy.UNION:
          assert(typeString.startsWith('[') && typeString.endsWith(']!'), `Directive @${definition.name} has a field strategy of ${strategy} for argument ${argumentName}, but the argument is not of type [T]!`);
          break;
        default:
          assertUnreachable(strategy);
      }
    });
  }

  /**
   * For a field, perform the propagation strategy for all values in each directive that contributes to it.
   */
  private static performStrategyForField(strategy: FieldPropagationStrategy, values: any[]) {
    switch (strategy) {
      case FieldPropagationStrategy.MAX:
        return Math.max(...values);
      case FieldPropagationStrategy.MIN:
        return Math.min(...values);
      case FieldPropagationStrategy.SUM:
        return values.reduce((acc, val) => acc + val, 0);
      case FieldPropagationStrategy.AND:
        return values.every(val => val);
      case FieldPropagationStrategy.OR:
        return values.some(val => val);
      case FieldPropagationStrategy.INTERSECTION:
        return values.reduce((acc, val) => acc.filter((v: any) => val.includes(v)), values[0]);
      case FieldPropagationStrategy.UNION:
        return values.reduce((acc, val) => {
          const newValues = val.filter((v: any) => !acc.includes(v));
          return acc.concat(newValues);
        }, []);
      default:
        assertUnreachable(strategy);
    }
  }

  /**
   * For each field, perform the propagation strategy for all values in each directive that contributes to it.
   */
  processFieldDirectives(directives: Directive<any>[]): { [name: string]: any}[] {
    const fields = Array.from(this.fieldStrategies
      .entries())
      .map(([fieldName, strategy]) => {
        // get all values for the field from each directive
        const fieldValues = directives.map(directive => directive.arguments()[fieldName]);
        const value = DirectiveCompositionEntry.performStrategyForField(strategy, fieldValues);
        return [fieldName, value];
      })
      .reduce((acc, [name, value]) => {
        return {
          ...acc,
          [name]: value,
        };
      }, {});
    return [fields];
  }
}
