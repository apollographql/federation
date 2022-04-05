import { SubgraphASTNode } from "@apollo/federation-internals";
import { printLocation } from "graphql";

export type HintID = {
  code: string,
  description: string,
}

const INCONSISTENT_FIELD_TYPE: HintID = {
  code: 'InconsistentFieldType',
  description: 'Indicates that a field does not have the exact same types in all subgraphs, but that the types are "compatible"'
    + ' (2 types are compatible if one is a non-nullable version of the other, a list version, a subtype, or a'
    + ' combination of the former).',
};

const INCONSISTENT_ARGUMENT_TYPE: HintID = {
  code: 'InconsistentArgumentType',
  description: 'Indicates that an argument type (of a field/input field/directive definition) does not have the exact same types'
    + ' in all subgraphs, but that the types are "compatible" (2 types are compatible if one is a non-nullable'
    + ' version of the other, a list version, a subtype, or a combination of the former).',
};

const INCONSISTENT_DEFAULT_VALUE: HintID = {
  code: 'InconsistentDefaultValuePresence',
  description: 'Indicates that an argument definition (of a field/input field/directive definition) has a default value in only'
    + ' some of the subgraphs that define the argument.',
};

const INCONSISTENT_ENTITY: HintID = {
  code: 'InconsistentEntity',
  description: 'Indicates that an object is declared as an entity (has a `@key`) in only some of the subgraphs in which the object is defined.',
};

const INCONSISTENT_OBJECT_VALUE_TYPE_FIELD: HintID = {
  code: 'InconsistentObjectValueTypeField',
  description: 'Indicates that a field of an object "value type" (has no `@key` in any subgraph) is not defined in all the subgraphs that declare the type.',
};

const INCONSISTENT_INTERFACE_VALUE_TYPE_FIELD: HintID = {
  code: 'InconsistentInterfaceValueTypeField',
  description: 'Indicates that a field of an interface "value type" (has no  `@key` in any subgraph) is not defined in all the subgraphs that declare the type.',
};

const INCONSISTENT_INPUT_OBJECT_FIELD: HintID = {
  code: 'InconsistentInputObjectField',
  description: 'Indicates that a field of an input object type definition is only defined in a subset of the subgraphs that declare the input object.',
};

const INCONSISTENT_UNION_MEMBER: HintID = {
  code: 'InconsistentUnionMember',
  description: 'Indicates that a member of a union type definition is only defined in a subset of the subgraphs that declare the union.',
};

const INCONSISTENT_ENUM_VALUE_FOR_INPUT_ENUM: HintID = {
  code: 'InconsistentEnumValueForInputEnum',
  description: 'Indicates that a value of an enum type definition (that is only used as an Input type) has not been merged into the supergraph because it is defined in only a subset of the subgraphs that declare the enum',
};

const INCONSISTENT_ENUM_VALUE_FOR_OUTPUT_ENUM: HintID = {
  code: 'InconsistentEnumValueForOutputEnum',
  description: 'Indicates that a value of an enum type definition (that is only used as an Output type, or is unused) has been merged in the supergraph but is defined in only a subset of the subgraphs that declare the enum',
};

const INCONSISTENT_TYPE_SYSTEM_DIRECTIVE_REPEATABLE: HintID = {
  code: 'InconsistentTypeSystemDirectiveRepeatable',
  description: 'Indicates that a type system directive definition is marked repeatable in only a subset of the subgraphs that declare the directive (and will be repeatable in the supergraph).',
};

const INCONSISTENT_TYPE_SYSTEM_DIRECTIVE_LOCATIONS: HintID = {
  code: 'InconsistentTypeSystemDirectiveLocations',
  description: 'Indicates that a type system directive definition is declared with inconsistent locations across subgraphs (and will use the union of all locations in the supergraph).',
};

const INCONSISTENT_EXECUTION_DIRECTIVE_PRESENCE: HintID = {
  code: 'InconsistentExecutionDirectivePresence',
  description: 'Indicates that an execution directive definition is declared in only some of the subgraphs.',
};

const NO_EXECUTION_DIRECTIVE_LOCATIONS_INTERSECTION: HintID = {
  code: 'NoExecutionDirectiveIntersection',
  description: 'Indicates that, for an execution directive definition, no location for it appears in all subgraphs.',
};

const INCONSISTENT_EXECUTION_DIRECTIVE_REPEATABLE: HintID = {
  code: 'InconsistentExecutionDirectiveRepeatable',
  description: 'Indicates that an execution directive definition is marked repeatable in only a subset of the subgraphs (and will not be repeatable in the supergraph).',
};

const INCONSISTENT_EXECUTION_DIRECTIVE_LOCATIONS: HintID = {
  code: 'InconsistentExecutionDirectiveLocations',
  description: 'Indicates that an execution directive definition is declared with inconsistent locations across subgraphs (and will use the intersection of all locations in the supergraph).',
};

const INCONSISTENT_DESCRIPTION: HintID = {
  code: 'InconsistentDescription',
  description: 'Indicates that an element has a description in more than one subgraph, and the descriptions are not equal.',
};

const INCONSISTENT_ARGUMENT_PRESENCE: HintID = {
  code: 'InconsistentArgumentPresence',
  description: 'Indicates that an (optional) argument (of a field or directive definition) is not present in all subgraphs and will not be part of the supergraph.',
};

const FROM_SUBGRAPH_DOES_NOT_EXIST: HintID = {
  code: 'FromSubgraphDoesNotExist',
  description: 'Source subgraph specified by @override directive does not exist',
};

const OVERRIDDEN_FIELD_CAN_BE_REMOVED: HintID = {
  code: 'OverriddenFieldCanBeRemoved',
  description: 'Field has been overridden by another subgraph. Consider removing.',
};

const OVERRIDE_DIRECTIVE_CAN_BE_REMOVED: HintID = {
  code: 'OverrideDirectiveCanBeRemoved',
  description: 'Field with @override directive no longer exists in source subgraph, the directive can be safely removed',
};

const UNUSED_ENUM_TYPE: HintID = {
  code: 'UnusedEnumType',
  description: 'Indicates that an enum type is defined in some subgraphs but is unused (no field/argument references it) and will not be included in the supergraph',
};

export const HINTS = {
  INCONSISTENT_FIELD_TYPE,
  INCONSISTENT_ARGUMENT_TYPE,
  INCONSISTENT_DEFAULT_VALUE,
  INCONSISTENT_ENTITY,
  INCONSISTENT_OBJECT_VALUE_TYPE_FIELD,
  INCONSISTENT_INTERFACE_VALUE_TYPE_FIELD,
  INCONSISTENT_INPUT_OBJECT_FIELD,
  INCONSISTENT_UNION_MEMBER,
  INCONSISTENT_ENUM_VALUE_FOR_INPUT_ENUM,
  INCONSISTENT_ENUM_VALUE_FOR_OUTPUT_ENUM,
  INCONSISTENT_TYPE_SYSTEM_DIRECTIVE_REPEATABLE,
  INCONSISTENT_TYPE_SYSTEM_DIRECTIVE_LOCATIONS,
  INCONSISTENT_EXECUTION_DIRECTIVE_PRESENCE,
  NO_EXECUTION_DIRECTIVE_LOCATIONS_INTERSECTION,
  INCONSISTENT_EXECUTION_DIRECTIVE_REPEATABLE,
  INCONSISTENT_EXECUTION_DIRECTIVE_LOCATIONS,
  INCONSISTENT_DESCRIPTION,
  INCONSISTENT_ARGUMENT_PRESENCE,
  FROM_SUBGRAPH_DOES_NOT_EXIST,
  OVERRIDDEN_FIELD_CAN_BE_REMOVED,
  OVERRIDE_DIRECTIVE_CAN_BE_REMOVED,
  UNUSED_ENUM_TYPE,
}

export class CompositionHint {
  public readonly nodes?: readonly SubgraphASTNode[];

  constructor(
    readonly id: HintID,
    readonly message: string,
    nodes?: readonly SubgraphASTNode[] | SubgraphASTNode
  ) {
    this.nodes = nodes
      ? (Array.isArray(nodes) ? (nodes.length === 0 ? undefined : nodes) : [nodes])
      : undefined;
  }

  toString(): string {
    return `[${this.id.code}]: ${this.message}`
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
