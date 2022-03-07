import { SubgraphASTNode } from "@apollo/federation-internals";
import { printLocation } from "graphql";

export class HintID {
  constructor(
    readonly code: string,
    readonly description: string,
    readonly mainElementDescription: string
  ) {
  }

  toString(): string {
    return `${this.code}: ${this.description}`;
  }
}

export const hintInconsistentFieldType = new HintID(
  'InconsistentFieldType',
  'Indicates that a field does not have the exact same types in all subgraphs, but that the types are "compatible"'
    + ' (2 types are compatible if one is a non-nullable version of the other, a list version, a subtype, or a'
    + ' combination of the former).',
  'the field with mismatched types'
);

export const hintInconsistentArgumentType = new HintID(
  'InconsistentArgumentType',
  'Indicates that an argument type (of a field/input field/directive definition) does not have the exact same types'
    + ' in all subgraphs, but that the types are "compatible" (2 types are compatible if one is a non-nullable'
    + ' version of the other, a list version, a subtype, or a combination of the former).',
  'the argument with mismatched types'
);

export const hintInconsistentDefaultValue = new HintID(
  'InconsistentDefaultValuePresence',
  'Indicates that an argument definition (of a field/input field/directive definition) has a default value in only'
    + ' some of the subgraphs that define the argument.',
  'the argument with default values in only some subgraphs'
);

export const hintInconsistentEntity = new HintID(
  'InconsistentEntity',
  'Indicates that an object is declared as an entity (has a `@key`) in only some of the subgraphs in which the object is defined',
  'the object that is an entity in only some subgraphs'
);

export const hintInconsistentObjectValueTypeField = new HintID(
  'InconsistentObjectValueTypeField',
  'Indicates that a field of an object "value type" (has no `@key` in any subgraph) is not defined in all the subgraphs that declare the type',
  'the field that is inconsistently declared between subgraphs'
);

export const hintInconsistentInterfaceValueTypeField = new HintID(
  'InconsistentInterfaceValueTypeField',
  'Indicates that a field of an interface "value type" (has no  `@key` in any subgraph) is not defined in all the subgraphs that declare the type',
  'the field that is inconsistently declared between subgraphs'
);

export const hintInconsistentInputObjectField = new HintID(
  'InconsistentInputObjectField',
  'Indicates that a field of an input object type definition is only defined in a subset of the subgraphs that declare the input object',
  'the field that is inconsistently declared between subgraphs'
);

export const hintInconsistentUnionMember = new HintID(
  'InconsistentUnionMember',
  'Indicates that a member of a union type definition is only defined in a subset of the subgraphs that declare the union',
  'the union type which has an inconsistent member'
);

export const hintInconsistentEnumValue = new HintID(
  'InconsistentEnumValue',
  'Indicates that a value of an enum type definition is defined in only a subset of the subgraphs that declare the enum',
  'the union type which has an inconsistent member'
);

export const hintInconsistentTypeSystemDirectiveRepeatable = new HintID(
  'InconsistentTypeSystemDirectiveRepeatable',
  'Indicates that a type system directive definition is marked repeatable in only a subset of the subgraphs that declare the directive (and will be repeatable in the supergraph)',
  'the inconsistent directive'
);

export const hintInconsistentTypeSystemDirectiveLocations = new HintID(
  'InconsistentTypeSystemDirectiveLocations',
  'Indicates that a type system directive definition is declared with inconsistent locations across subgraphs (and will use the union of all locations in the supergraph)',
  'the inconsistent directive'
);

export const hintInconsistentExecutionDirectivePresence = new HintID(
  'InconsistentExecutionDirectivePresence',
  'Indicates that an execution directive definition is declared in only some of the subgraphs',
  'the inconsistent directive'
);

export const hintNoExecutionDirectiveLocationsIntersection = new HintID(
  'NoExecutionDirectiveIntersection',
  'Indicates that, for an execution directive definition, no location for it appears in all subgraphs',
  'the inconsistent directive'
);

export const hintInconsistentExecutionDirectiveRepeatable = new HintID(
  'InconsistentExecutionDirectiveRepeatable',
  'Indicates that an execution directive definition is marked repeatable in only a subset of the subgraphs (and will not be repeatable in the supergraph)',
  'the inconsistent directive'
);

export const hintInconsistentExecutionDirectiveLocations = new HintID(
  'InconsistentExecutionDirectiveLocations',
  'Indicates that an execution directive definition is declared with inconsistent locations across subgraphs (and will use the intersection of all locations in the supergraph)',
  'the inconsistent directive'
);

export const hintInconsistentDescription = new HintID(
  'InconsistentDescription',
  'Indicates that an element has a description in more than one subgraph, and the descriptions are not equal',
  'the element with inconsistent description'
);

export const hintInconsistentArgumentPresence = new HintID(
  'InconsistentArgumentPresence',
  'Indicates that an (optional) argument (of a field or directive definition) is not present in all subgraphs '
  + ' and will not be part of the supergraph',
  'the argument with mismatched types'
);

export class CompositionHint {
  public readonly nodes?: readonly SubgraphASTNode[];

  constructor(
    readonly id: HintID,
    readonly message: string,
    readonly elementCoordinate: string,
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
