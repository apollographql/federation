import { NamedSchemaElement, SubgraphASTNode } from "@apollo/federation-internals";
import { printLocation } from "graphql";

export enum HintLevel {
  WARN = 60,
  INFO = 40,
  DEBUG = 20,
}

export type HintCodeDefinition = {
  code: string,
  // Note that we keep the name separately, because while it can be obtained easily enough
  // with `HintLevel[value]` on the JS/TS-side, the name would otherwise be lost when
  // serializing the related objects to JSON for rover.
  level: { value: HintLevel, name: string},
  description: string,
}

function makeCodeDefinition({
  code,
  level,
  description,
}: {
  code: string,
  level: HintLevel,
  description: string,
}): HintCodeDefinition {
  return ({
    code,
    level: { value: level, name: HintLevel[level]},
    description,
  });
}

const INCONSISTENT_BUT_COMPATIBLE_FIELD_TYPE = makeCodeDefinition({
  code: 'INCONSISTENT_BUT_COMPATIBLE_FIELD_TYPE',
  level: HintLevel.INFO,
  description: 'Indicates that a field does not have the exact same types in all subgraphs, but that the types are "compatible"'
    + ' (2 types are compatible if one is a non-nullable version of the other, a list version, a subtype, or a'
    + ' combination of the former).',
});

const INCONSISTENT_BUT_COMPATIBLE_ARGUMENT_TYPE = makeCodeDefinition({
  code: 'INCONSISTENT_BUT_COMPATIBLE_ARGUMENT_TYPE',
  level: HintLevel.INFO,
  description: 'Indicates that an argument type (of a field/input field/directive definition) does not have the exact same type'
    + ' in all subgraphs, but that the types are "compatible" (two types are compatible if one is a non-nullable'
    + ' version of the other, a list version, a subtype, or a combination of the former).',
});

const INCONSISTENT_DEFAULT_VALUE_PRESENCE = makeCodeDefinition({
  code: 'INCONSISTENT_DEFAULT_VALUE_PRESENCE',
  level: HintLevel.WARN,
  description: 'Indicates that an argument definition (of a field/input field/directive definition) has a default value in only'
    + ' some of the subgraphs that define the argument.',
});

const INCONSISTENT_ENTITY = makeCodeDefinition({
  code: 'INCONSISTENT_ENTITY',
  level: HintLevel.INFO,
  description: 'Indicates that an object is declared as an entity (has a `@key`) in only some of the subgraphs in which the object is defined.',
});

const INCONSISTENT_OBJECT_VALUE_TYPE_FIELD = makeCodeDefinition({
  code: 'INCONSISTENT_OBJECT_VALUE_TYPE_FIELD',
  level: HintLevel.DEBUG,
  description: 'Indicates that a field of an object "value type" (has no `@key` in any subgraph) is not defined in all the subgraphs that declare the type.',
});

const INCONSISTENT_INTERFACE_VALUE_TYPE_FIELD = makeCodeDefinition({
  code: 'INCONSISTENT_INTERFACE_VALUE_TYPE_FIELD',
  level: HintLevel.DEBUG,
  description: 'Indicates that a field of an interface "value type" (has no `@key` in any subgraph) is not defined in all the subgraphs that declare the type.',
});

const INCONSISTENT_INPUT_OBJECT_FIELD = makeCodeDefinition({
  code: 'INCONSISTENT_INPUT_OBJECT_FIELD',
  level: HintLevel.WARN,
  description: 'Indicates that a field of an input object type definition is only defined in a subset of the subgraphs that declare the input object.',
});

const INCONSISTENT_UNION_MEMBER = makeCodeDefinition({
  code: 'INCONSISTENT_UNION_MEMBER',
  level: HintLevel.DEBUG,
  description: 'Indicates that a member of a union type definition is only defined in a subset of the subgraphs that declare the union.',
});

const INCONSISTENT_ENUM_VALUE_FOR_INPUT_ENUM = makeCodeDefinition({
  code: 'INCONSISTENT_ENUM_VALUE_FOR_INPUT_ENUM',
  level: HintLevel.WARN,
  description: 'Indicates that a value of an enum type definition (that is only used as an Input type) has not been merged into the supergraph because it is defined in only a subset of the subgraphs that declare the enum',
});

const INCONSISTENT_ENUM_VALUE_FOR_OUTPUT_ENUM = makeCodeDefinition({
  code: 'INCONSISTENT_ENUM_VALUE_FOR_OUTPUT_ENUM',
  level: HintLevel.DEBUG,
  description: 'Indicates that a value of an enum type definition (that is only used as an Output type, or is unused) has been merged in the supergraph but is defined in only a subset of the subgraphs that declare the enum',
});

const INCONSISTENT_TYPE_SYSTEM_DIRECTIVE_REPEATABLE = makeCodeDefinition({
  code: 'INCONSISTENT_TYPE_SYSTEM_DIRECTIVE_REPEATABLE',
  level: HintLevel.DEBUG,
  description: 'Indicates that a type system directive definition is marked repeatable in only a subset of the subgraphs that declare the directive (and will be repeatable in the supergraph).',
});

const INCONSISTENT_TYPE_SYSTEM_DIRECTIVE_LOCATIONS = makeCodeDefinition({
  code: 'INCONSISTENT_TYPE_SYSTEM_DIRECTIVE_LOCATIONS',
  level: HintLevel.DEBUG,
  description: 'Indicates that a type system directive definition is declared with inconsistent locations across subgraphs (and will use the union of all locations in the supergraph).',
});

const INCONSISTENT_EXECUTABLE_DIRECTIVE_PRESENCE = makeCodeDefinition({
  code: 'INCONSISTENT_EXECUTABLE_DIRECTIVE_PRESENCE',
  level: HintLevel.WARN,
  description: 'Indicates that an executable directive definition is declared in only some of the subgraphs.',
});

const NO_EXECUTABLE_DIRECTIVE_LOCATIONS_INTERSECTION = makeCodeDefinition({
  code: 'NO_EXECUTABLE_DIRECTIVE_INTERSECTION',
  level: HintLevel.WARN,
  description: 'Indicates that, for an executable directive definition, no location for it appears in all subgraphs.',
});

const INCONSISTENT_EXECUTABLE_DIRECTIVE_REPEATABLE = makeCodeDefinition({
  code: 'INCONSISTENT_EXECUTABLE_DIRECTIVE_REPEATABLE',
  level: HintLevel.WARN,
  description: 'Indicates that an executable directive definition is marked repeatable in only a subset of the subgraphs (and will not be repeatable in the supergraph).',
});

const INCONSISTENT_EXECUTABLE_DIRECTIVE_LOCATIONS = makeCodeDefinition({
  code: 'INCONSISTENT_EXECUTABLE_DIRECTIVE_LOCATIONS',
  level: HintLevel.WARN,
  description: 'Indicates that an executiable directive definition is declared with inconsistent locations across subgraphs (and will use the intersection of all locations in the supergraph).',
});

const INCONSISTENT_DESCRIPTION = makeCodeDefinition({
  code: 'INCONSISTENT_DESCRIPTION',
  level: HintLevel.WARN,
  description: 'Indicates that an element has a description in more than one subgraph, and the descriptions are not equal.',
});

const INCONSISTENT_ARGUMENT_PRESENCE = makeCodeDefinition({
  code: 'INCONSISTENT_ARGUMENT_PRESENCE',
  level: HintLevel.WARN,
  description: 'Indicates that an optional argument (of a field or directive definition) is not present in all subgraphs and will not be part of the supergraph.',
});

const FROM_SUBGRAPH_DOES_NOT_EXIST = makeCodeDefinition({
  code: 'FROM_SUBGRAPH_DOES_NOT_EXIST',
  level: HintLevel.WARN,
  description: 'Source subgraph specified by @override directive does not exist',
});

const OVERRIDDEN_FIELD_CAN_BE_REMOVED = makeCodeDefinition({
  code: 'OVERRIDDEN_FIELD_CAN_BE_REMOVED',
  level: HintLevel.INFO,
  description: 'Field has been overridden by another subgraph. Consider removing.',
});

const OVERRIDE_DIRECTIVE_CAN_BE_REMOVED = makeCodeDefinition({
  code: 'OVERRIDE_DIRECTIVE_CAN_BE_REMOVED',
  level: HintLevel.INFO,
  description: 'Field with @override directive no longer exists in source subgraph, the directive can be safely removed',
});

const UNUSED_ENUM_TYPE = makeCodeDefinition({
  code: 'UNUSED_ENUM_TYPE',
  level: HintLevel.DEBUG,
  description: 'Indicates that an enum type is defined in some subgraphs but is unused (no field/argument references it). All the values from subgraphs defining that enum will be included in the supergraph.',
});

const INCONSISTENT_NON_REPEATABLE_DIRECTIVE_ARGUMENTS = makeCodeDefinition({
  code: 'INCONSISTENT_NON_REPEATABLE_DIRECTIVE_ARGUMENTS',
  level: HintLevel.WARN,
  description: 'A non-repeatable directive is applied to a schema element in different subgraphs but with arguments that are different.',
});

const MERGED_NON_REPEATABLE_DIRECTIVE_ARGUMENTS = makeCodeDefinition({
  code: 'MERGED_NON_REPEATABLE_DIRECTIVE_ARGUMENTS',
  level: HintLevel.INFO,
  description: 'A non-repeatable directive has been applied to a schema element in different subgraphs with different arguments and the arguments values were merged using the directive configured strategies.',
});

const DIRECTIVE_COMPOSITION_INFO = makeCodeDefinition({
  code: 'DIRECTIVE_COMPOSITION_INFO',
  level: HintLevel.INFO,
  description: 'Indicates that an issue was detected when composing custom directives.',
});

const DIRECTIVE_COMPOSITION_WARN = makeCodeDefinition({
  code: 'DIRECTIVE_COMPOSITION_WARN',
  level: HintLevel.WARN,
  description: 'Indicates that an issue was detected when composing custom directives.',
});

const INCONSISTENT_RUNTIME_TYPES_FOR_SHAREABLE_RETURN = makeCodeDefinition({
  code: 'INCONSISTENT_RUNTIME_TYPES_FOR_SHAREABLE_RETURN',
  level: HintLevel.WARN,
  description: 'Indicates that a @shareable field returns different sets of runtime types in the different subgraphs in which it is defined.',
});

export const HINTS = {
  INCONSISTENT_BUT_COMPATIBLE_FIELD_TYPE,
  INCONSISTENT_BUT_COMPATIBLE_ARGUMENT_TYPE,
  INCONSISTENT_DEFAULT_VALUE_PRESENCE,
  INCONSISTENT_ENTITY,
  INCONSISTENT_OBJECT_VALUE_TYPE_FIELD,
  INCONSISTENT_INTERFACE_VALUE_TYPE_FIELD,
  INCONSISTENT_INPUT_OBJECT_FIELD,
  INCONSISTENT_UNION_MEMBER,
  INCONSISTENT_ENUM_VALUE_FOR_INPUT_ENUM,
  INCONSISTENT_ENUM_VALUE_FOR_OUTPUT_ENUM,
  INCONSISTENT_TYPE_SYSTEM_DIRECTIVE_REPEATABLE,
  INCONSISTENT_TYPE_SYSTEM_DIRECTIVE_LOCATIONS,
  INCONSISTENT_EXECUTABLE_DIRECTIVE_PRESENCE,
  NO_EXECUTABLE_DIRECTIVE_LOCATIONS_INTERSECTION,
  INCONSISTENT_EXECUTABLE_DIRECTIVE_REPEATABLE,
  INCONSISTENT_EXECUTABLE_DIRECTIVE_LOCATIONS,
  INCONSISTENT_DESCRIPTION,
  INCONSISTENT_ARGUMENT_PRESENCE,
  FROM_SUBGRAPH_DOES_NOT_EXIST,
  OVERRIDDEN_FIELD_CAN_BE_REMOVED,
  OVERRIDE_DIRECTIVE_CAN_BE_REMOVED,
  UNUSED_ENUM_TYPE,
  INCONSISTENT_NON_REPEATABLE_DIRECTIVE_ARGUMENTS,
  MERGED_NON_REPEATABLE_DIRECTIVE_ARGUMENTS,
  DIRECTIVE_COMPOSITION_INFO,
  DIRECTIVE_COMPOSITION_WARN,
  INCONSISTENT_RUNTIME_TYPES_FOR_SHAREABLE_RETURN,
}

export class CompositionHint {
  public readonly nodes?: readonly SubgraphASTNode[];
  public readonly coordinate?: string;

  constructor(
    readonly definition: HintCodeDefinition,
    readonly message: string,
    readonly element: NamedSchemaElement<any, any, any> | undefined,
    nodes?: readonly SubgraphASTNode[] | SubgraphASTNode
  ) {
    this.nodes = nodes
      ? (Array.isArray(nodes) ? (nodes.length === 0 ? undefined : nodes) : [nodes])
      : undefined;
    this.coordinate = element?.coordinate;
  }

  toString(): string {
    return `[${this.definition.code}]: ${this.message}`
  }
}

/**
 * Prints a composition hint to a string, alongside useful location information
 * about relevant positions in the subgraph sources.
 */
export function printHint(hint: CompositionHint): string {
  let output = hint.toString();

  if (hint.nodes) {
    for (const node of hint.nodes) {
      if (node.loc) {
        output += '\n\n' + printLocation(node.loc);
      }
    }
  }

  return output;
}
