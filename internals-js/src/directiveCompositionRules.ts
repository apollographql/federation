import { DirectiveLocation } from 'graphql';
import { Directive, DirectiveDefinition, FieldDefinition, NamedSchemaElement, ObjectType, Schema } from './definitions'
import { assert, isDefined, isNotNull } from './utils';

export enum DirectiveCompositionStrategy {
  COLLAPSE = 'collapse',
  COLLAPSE_FROM_ALL = 'collapseFromAll',
  REMOVE_DUPLICATES = 'removeDuplicates',
}

export enum DirectivePropagationStrategy {
  INHERIT_FROM_OBJECT = 'inheritFromObject',
  CONSISTENT_LOCATION = 'consistentLocation',
}

export enum FieldPropagationStrategy {
  MAX = 'max',
  MIN = 'min',
  SUM = 'sum',
  AVERAGE = 'average',
  AND = 'and',
  OR = 'or',
  INTERSECTION = 'intersection',
  UNION = 'union',
  EXACT = 'exact',
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
      schemas[i].directives().forEach(directive => {
        const nameInSchema = schemas[i].coreFeatures?.getByIdentity('federation')?.directiveNameInSchema(directive.name) ?? directive.name;
        if (nameInSchema !== undefined) {
          this.directiveNameLookup[i].set(directive.name, nameInSchema);
        }
      });
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
    if (entry.compositionStrategy === DirectiveCompositionStrategy.COLLAPSE_FROM_ALL && directives.includes(null)) {
      throw new Error(`Directive @${entry.definition.name} is marked as collapseFromAll, but not all subgraphs have the directive applied to the field.`);
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
    sources.forEach((source, idx) => {
      if (source === undefined) {
        return;
      }
      this.propagateDirectivesToFields(source, idx);
    });
    this.entries.forEach(entry => {
      this.mergeSchemaElement(sources, target, entry);
    });
  }

  private propagateDirectivesToFields(object: ObjectType, schemaIndex: number) {
    const entries = this.entries
      .filter(entry => entry.propagationStrategy === DirectivePropagationStrategy.INHERIT_FROM_OBJECT);

    entries.forEach(entry => {
      object.fields().forEach(field => {
        const directiveName = this.getDirectiveNameInSchema(entry.definition.name, schemaIndex);
        if (directiveName === undefined) {
          return;
        }
        const directive = object.appliedDirectivesOf(directiveName);
        if (directive.length !== 1) {
          return;
        }
        if (!field.hasAppliedDirective(directiveName)) {
          const nameInSchema = this.schemas[schemaIndex].coreFeatures?.getByIdentity('federation')?.directiveNameInSchema(entry.definition.name) ?? entry.definition.name;
          const definitionInSchema = this.schemas[schemaIndex].directive(nameInSchema);
          assert(definitionInSchema !== undefined, `Directive ${nameInSchema} is not defined in schema ${schemaIndex}.`)
          field.applyDirective(definitionInSchema, directive[0].arguments());
        }
      });
    });
  }
}

export class DirectiveCompositionEntry {
  constructor(
    readonly definition: DirectiveDefinition,
    readonly compositionStrategy: DirectiveCompositionStrategy,
    readonly propagationStrategy: DirectivePropagationStrategy,
    readonly fieldStrategies: Map<string, FieldPropagationStrategy> = new Map(),
  ) {
    if (definition.locations.some(loc => !SUPPORTED_LOCATIONS.includes(loc))) {
      throw new Error(`Directive @${definition.name} has unsupported locations: ${definition.locations.join(', ')}.`);
    }

    if (definition.repeatable && (compositionStrategy === DirectiveCompositionStrategy.COLLAPSE || compositionStrategy === DirectiveCompositionStrategy.COLLAPSE_FROM_ALL)) {
      throw new Error(`Directive @${definition.name} is repeatable, but its composition strategy is ${compositionStrategy}.`)
    }

    if (definition.repeatable && propagationStrategy === DirectivePropagationStrategy.INHERIT_FROM_OBJECT) {
      throw new Error(`Directive @${definition.name} is repeatable, but its propagation strategy is ${propagationStrategy}.`)
    }

    if (propagationStrategy === DirectivePropagationStrategy.INHERIT_FROM_OBJECT && !definition.locations.includes(DirectiveLocation.FIELD_DEFINITION)) {
      throw new Error(`Directive @${definition.name} is marked as inheritFromObject, but FIELD_DEFINITION is not one of its locations.`);
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

      const typeString = definition.arguments().find(arg => arg.name === argumentName)!.type!.toString();
      switch(strategy) {
        case FieldPropagationStrategy.MAX:
        case FieldPropagationStrategy.MIN:
        case FieldPropagationStrategy.SUM:
        case FieldPropagationStrategy.AVERAGE:
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
      case FieldPropagationStrategy.AVERAGE:
        return values.reduce((acc, val) => acc + val, 0) / values.length;
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
      case FieldPropagationStrategy.EXACT:
        // this should never happen
        throw new Error('Exact field strategy should not be used for non-exact fields');
    }
  }

  processFieldDirectives(directives: Directive<any>[]): any[][] {
    const buckets: Directive<FieldDefinition<any>, { [key: string]: any }>[][] = [];
    const exactMatchFields = Array.from(this.fieldStrategies.entries()).filter(([_, strategy]) => strategy === FieldPropagationStrategy.EXACT);
    const nonExactMatchFields = Array.from(this.fieldStrategies.entries()).filter(([_, strategy]) => strategy !== FieldPropagationStrategy.EXACT).map(([fieldName, _]) => fieldName);

    directives.forEach(directive => {
      // find the bucket we should put this directive in
      const bucket = buckets.find(bucket => {
        return exactMatchFields.every(([fieldName, _]) => {
          return bucket[0].arguments(true)[fieldName] === directive.arguments()[fieldName];
        })
      });

      // if we found a matching bucket, add the directive to it. Otherwise, create a new bucket
      if (bucket) {
        bucket.push(directive);
      } else {
        buckets.push([directive]);
      }
    });

    // now we need to transform each bucket into a single directive
    return buckets.map(bucket => {
      return Object.fromEntries(
        nonExactMatchFields
          .map(fieldName => {
            const strategy = this.fieldStrategies.get(fieldName)!;
            const fieldValues = bucket.map(directive => directive.arguments()[fieldName]);
            return [fieldName, DirectiveCompositionEntry.performStrategyForField(strategy, fieldValues)];
          })
          .concat(exactMatchFields.map(([fieldName, _]) => [fieldName, bucket[0].arguments()[fieldName]]))
      );
    });
  }
}
