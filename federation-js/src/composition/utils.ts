import {
  InterfaceTypeExtensionNode,
  FieldDefinitionNode,
  Kind,
  StringValueNode,
  NameNode,
  DocumentNode,
  visit,
  ObjectTypeExtensionNode,
  DirectiveNode,
  GraphQLNamedType,
  GraphQLError,
  GraphQLSchema,
  isObjectType,
  GraphQLObjectType,
  getNamedType,
  GraphQLField,
  isEqualType,
  FieldNode,
  TypeDefinitionNode,
  InputValueDefinitionNode,
  TypeExtensionNode,
  BREAK,
  print,
  ASTNode,
  DirectiveDefinitionNode,
  GraphQLDirective,
  OperationTypeNode,
  isDirective,
  isNamedType,
  stripIgnoredCharacters,
  NonNullTypeNode,
  NamedTypeNode,
  TokenKind,
} from 'graphql';
import {
  ExternalFieldDefinition,
  DefaultRootOperationTypeName,
  Maybe,
  FederationDirective,
  ServiceDefinition,
} from './types';
import type { FederationType, FederationField, FieldSet } from './types';
import type { ASTNodeWithDirectives } from '@apollo/subgraph/dist/directives';
import { knownSubgraphDirectives } from '@apollo/subgraph/dist/directives';
import { assert, isNotNullOrUndefined } from '../utilities';
import { Parser } from 'graphql/language/parser';

export function isStringValueNode(node: any): node is StringValueNode {
  return node.kind === Kind.STRING;
}

export function isDirectiveDefinitionNode(node: any): node is DirectiveDefinitionNode {
  return node.kind === Kind.DIRECTIVE_DEFINITION;
}

export function isNonNullTypeNode(node: any): node is NonNullTypeNode {
  return node.kind === Kind.NON_NULL_TYPE;
}

export function isNamedTypeNode(node: any): node is NamedTypeNode {
  return node.kind === Kind.NAMED_TYPE;
}

// Create a map of { fieldName: serviceName } for each field.
export function mapFieldNamesToServiceName<Node extends { name: NameNode }>(
  fields: ReadonlyArray<Node>,
  serviceName: string,
) {
  return fields.reduce((prev, next) => {
    prev[next.name.value] = serviceName;
    return prev;
  }, Object.create(null));
}

export function findDirectivesOnNode(
  node: Maybe<
    ASTNodeWithDirectives
  >,
  directiveName: string,
) {
  return (
    node?.directives?.filter(
      (directive) => directive.name.value === directiveName,
    ) ?? []
  );
}

/**
 * Core change: print fieldsets for @join__field's @key, @requires, and @provides args
 *
 * @param selections
 */
export function printFieldSet(selections: FieldSet): string {
  return selections
    .map((selection) => stripIgnoredCharacters(print(selection)))
    .join(' ');
}

/**
 * Find a matching selection set on a node given it's string form,
 * directive name and the node to search on
 *
 * @param node
 * @param directiveName
 * @param printedSelectionSet
 * @returns
 */
export function findSelectionSetOnNode(
  node: Maybe<
    ASTNodeWithDirectives
  >,
  directiveName: string,
  printedSelectionSet: string,
) {
  return node?.directives?.find(
        directive =>
          directive.name.value === directiveName && directive.arguments?.some(
            argument => isStringValueNode(argument.value) &&
              argument.value.value === printedSelectionSet
          ))?.arguments?.find(
            argument => argument.name.value === 'fields')?.value;
}

export function stripExternalFieldsFromTypeDefs(
  typeDefs: DocumentNode,
  serviceName: string,
): {
  typeDefsWithoutExternalFields: DocumentNode;
  strippedFields: ExternalFieldDefinition[];
} {
  const strippedFields: ExternalFieldDefinition[] = [];

  const typeDefsWithoutExternalFields = visit(typeDefs, {
    ObjectTypeExtension: removeExternalFieldsFromExtensionVisitor(
      strippedFields,
      serviceName,
    ),
    InterfaceTypeExtension: removeExternalFieldsFromExtensionVisitor(
      strippedFields,
      serviceName,
    ),
  }) as DocumentNode;

  return { typeDefsWithoutExternalFields, strippedFields };
}

export function stripTypeSystemDirectivesFromTypeDefs(typeDefs: DocumentNode) {
  const typeDefsWithoutTypeSystemDirectives = visit(typeDefs, {
    Directive(node) {
      // The `deprecated` directive is an exceptional case that we want to leave in
      if (node.name.value === 'deprecated' || node.name.value === 'specifiedBy') return;

      const isKnownSubgraphDirective = knownSubgraphDirectives.some(
        ({ name }) => name === node.name.value,
      );
      // Returning `null` to a visit will cause it to be removed from the tree.
      return isKnownSubgraphDirective ? undefined : null;
    },
  }) as DocumentNode;

  return typeDefsWithoutTypeSystemDirectives;
}

/**
 * Returns a closure that strips fields marked with `@external` and adds them
 * to an array.
 * @param collector
 * @param serviceName
 */
function removeExternalFieldsFromExtensionVisitor<
  T extends InterfaceTypeExtensionNode | ObjectTypeExtensionNode
>(collector: ExternalFieldDefinition[], serviceName: string) {
  return (node: T) => {
    let fields = node.fields;
    if (fields) {
      fields = fields.filter(field => {
        const externalDirectives = findDirectivesOnNode(field, 'external');

        if (externalDirectives.length > 0) {
          collector.push({
            field,
            parentTypeName: node.name.value,
            serviceName,
          });
          return false;
        }
        return true;
      });
    }
    return {
      ...node,
      fields,
    };
  };
}

/**
 * For lack of a "home of federation utilities", this function is copy/pasted
 * verbatim across the federation and query-planner packages. Any changes
 * made here should be reflected in the other location as well.
 *
 * @param source A string representing a FieldSet
 * @returns A parsed FieldSet
 */
 export function parseFieldSet(source: string): FieldSet {
  const parser = new Parser(`{${source}}`);

  parser.expectToken(TokenKind.SOF)
  const selectionSet = parser.parseSelectionSet();
  try {
    parser.expectToken(TokenKind.EOF);
  } catch {
    throw new Error(`Invalid FieldSet provided: '${source}'. FieldSets may not contain operations within them.`);
  }
  const selections = selectionSet.selections;
  // I'm not sure this case is possible - an empty string will first throw a
  // graphql syntax error. Can you get 0 selections any other way?
  assert(selections.length > 0, `Field sets may not be empty`);

  visit(selectionSet, {
    FragmentSpread() {
      throw Error(
        `Field sets may not contain fragment spreads, but found: "${source}"`,
      );
    },
  });

  // This cast is asserted above by the visitor, ensuring that both `selections`
  // and any recursive `selections` are not `FragmentSpreadNode`s
  return selections as FieldSet;
}

export function hasMatchingFieldInDirectives({
  directives,
  fieldNameToMatch,
  namedType,
}: {
  directives: DirectiveNode[];
  fieldNameToMatch: string;
  namedType: GraphQLNamedType;
}) {
  return Boolean(
    namedType.astNode &&
      directives
        // for each key directive, get the fields arg
        .map(keyDirective =>
          keyDirective.arguments &&
          isStringValueNode(keyDirective.arguments[0].value)
            ? {
                typeName: namedType.astNode!.name.value,
                keyArgument: keyDirective.arguments[0].value.value,
              }
            : null,
        )
        // filter out any null/undefined args
        .filter(isNotNullOrUndefined)
        // flatten all selections of the "fields" arg to a list of fields
        .flatMap(selection => parseFieldSet(selection.keyArgument))
        // find a field that matches the @external field
        .some(
          field =>
            field.kind === Kind.FIELD && field.name.value === fieldNameToMatch,
        ),
  );
}

export const logServiceAndType = (
  serviceName: string,
  typeName: string,
  fieldName?: string,
) => `[${serviceName}] ${typeName}${fieldName ? `.${fieldName} -> ` : ' -> '}`;

export function logDirective(directiveName: string) {
  return `[@${directiveName}] -> `;
}

// TODO: allow passing of the other args here, rather than just message and code
export function errorWithCode(
  code: string,
  message: string,
  nodes?: ReadonlyArray<ASTNode> | ASTNode | undefined,
) {
  return new GraphQLError(
    message,
    nodes,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      code,
    },
  );
}

export function findTypesContainingFieldWithReturnType(
  schema: GraphQLSchema,
  node: GraphQLField<any, any>,
): GraphQLObjectType[] {
  const returnType = getNamedType(node.type);
  if (!isObjectType(returnType)) return [];

  const containingTypes: GraphQLObjectType[] = [];
  const types = schema.getTypeMap();
  for (const selectionSetType of Object.values(types)) {
    // Only object types have fields
    if (!isObjectType(selectionSetType)) continue;
    const allFields = selectionSetType.getFields();

    // only push types that have a field which returns the returnType
    Object.values(allFields).forEach(field => {
      const fieldReturnType = getNamedType(field.type);
      if (fieldReturnType === returnType) {
        containingTypes.push(fieldReturnType);
      }
    });
  }
  return containingTypes;
}

/**
 * Used for finding a field on the `schema` that returns `typeToFind`
 *
 * Used in validation of external directives to find uses of a field in a
 * `@provides` on another type.
 */
export function findFieldsThatReturnType({
  schema,
  typeToFind,
}: {
  schema: GraphQLSchema;
  typeToFind: GraphQLNamedType;
}): GraphQLField<any, any>[] {
  if (!isObjectType(typeToFind)) return [];

  const fieldsThatReturnType: GraphQLField<any, any>[] = [];
  const types = schema.getTypeMap();

  for (const selectionSetType of Object.values(types)) {
    // for our purposes, only object types have fields that we care about.
    if (!isObjectType(selectionSetType)) continue;

    const fieldsOnNamedType = selectionSetType.getFields();

    // push fields that have return `typeToFind`
    Object.values(fieldsOnNamedType).forEach(field => {
      const fieldReturnType = getNamedType(field.type);
      if (fieldReturnType === typeToFind) {
        fieldsThatReturnType.push(field);
      }
    });
  }
  return fieldsThatReturnType;
}

/**
 * Searches recursively to see if a selection set includes references to
 * `typeToFind.fieldToFind`.
 *
 * Used in validation of external fields to find where/if a field is referenced
 * in a nested selection set for `@requires`
 *
 * For every selection, look at the root of the selection's type.
 * 1. If it's the type we're looking for, check its fields.
 *    Return true if field matches. Skip to step 3 if not
 * 2. If it's not the type we're looking for, skip to step 3
 * 3. Get the return type for each subselection and run this function on the subselection.
 */
export function selectionIncludesField({
  selections,
  selectionSetType,
  typeToFind,
  fieldToFind,
}: {
  selections: FieldSet;
  selectionSetType: GraphQLObjectType; // type which applies to `selections`
  typeToFind: GraphQLObjectType; // type where the `@external` lives
  fieldToFind: string;
}): boolean {
  for (const selection of selections as FieldNode[]) {
    const selectionName: string = selection.name.value;

    // if the selected field matches the fieldname we're looking for,
    // and its type is correct, we're done. Return true;
    if (
      selectionName === fieldToFind &&
      isEqualType(selectionSetType, typeToFind)
    )
      return true;

    // if the field selection has a subselection, check each field recursively

    // check to make sure the parent type contains the field
    const typeIncludesField =
      selectionName &&
      Object.keys(selectionSetType.getFields()).includes(selectionName);
    if (!selectionName || !typeIncludesField) continue;

    // get the return type of the selection
    const returnType = getNamedType(
      selectionSetType.getFields()[selectionName].type,
    );
    if (!returnType || !isObjectType(returnType)) continue;
    const subselections =
      selection.selectionSet && (selection.selectionSet.selections as FieldSet);

    // using the return type of a given selection and all the subselections,
    // recursively search for matching selections. typeToFind and fieldToFind
    // stay the same
    if (subselections) {
      const selectionDoesIncludeField = selectionIncludesField({
        selectionSetType: returnType,
        selections: subselections,
        typeToFind,
        fieldToFind,
      });
      if (selectionDoesIncludeField) return true;
    }
  }
  return false;
}

/**
 * Returns true if a @key directive is found on the type node
 *
 * @param node TypeDefinitionNode | TypeExtensionNode
 * @returns boolean
 */
export function isTypeNodeAnEntity(
  node: TypeDefinitionNode | TypeExtensionNode,
) {
  let isEntity = false;

  visit(node, {
    Directive(directive) {
      if (directive.name.value === 'key') {
        isEntity = true;
        return BREAK;
      }
    },
  });

  return isEntity;
}

/**
 * Diff two type nodes. This returns an object consisting of useful properties and their differences
 * - name: An array of length 0 or 2. If their type names are different, they will be added to the array.
 *     (['Product', 'Product'])
 * - fields: An entry in the fields object can mean two things:
 *     1) a field was found on one type, but not the other (fieldName: ['String!'])
 *     2) a common field was found, but their types differ (fieldName: ['String!', 'Int!'])
 * - kind: An array of length 0 or 2. If their kinds are different, they will be added to the array.
 *     (['InputObjectTypeDefinition', 'InterfaceTypeDefinition'])
 *
 * @param firstNode TypeDefinitionNode | TypeExtensionNode | DirectiveDefinitionNode
 * @param secondNode TypeDefinitionNode | TypeExtensionNode | DirectiveDefinitionNode
 */
export function diffTypeNodes(
  firstNode: TypeDefinitionNode | TypeExtensionNode | DirectiveDefinitionNode,
  secondNode: TypeDefinitionNode | TypeExtensionNode | DirectiveDefinitionNode,
) {
  const fieldsDiff: {
    [fieldName: string]: string[];
  } = Object.create(null);

  const inputValuesDiff: {
    [inputName: string]: string[];
  } = Object.create(null);

  const unionTypesDiff: {
    [typeName: string]: boolean;
  } = Object.create(null);

  const locationsDiff: Set<string> = new Set();

  const argumentsDiff: {
    [argumentName: string]: string[];
  } = Object.create(null);

  const document: DocumentNode = {
    kind: Kind.DOCUMENT,
    definitions: [firstNode, secondNode],
  };

  function fieldVisitor(node: FieldDefinitionNode) {
    const fieldName = node.name.value;

    const type = print(node.type);

    if (!fieldsDiff[fieldName]) {
      fieldsDiff[fieldName] = [type];
      return;
    }

    // If we've seen this field twice and the types are the same, remove this
    // field from the diff result
    const fieldTypes = fieldsDiff[fieldName];
    if (fieldTypes[0] === type) {
      delete fieldsDiff[fieldName];
    } else {
      fieldTypes.push(type);
    }
  }

  /** Similar to fieldVisitor but specific for input values, so we don't store
   * fields and arguments in the same place.
   */

  function inputValueVisitor(node: InputValueDefinitionNode) {
    const fieldName = node.name.value;

    const type = print(node.type);

    if (!inputValuesDiff[fieldName]) {
      inputValuesDiff[fieldName] = [type];
      return;
    }

    // If we've seen this input value twice and the types are the same,
    // remove it from the diff result
    const inputValueTypes = inputValuesDiff[fieldName];
    if (inputValueTypes[0] === type) {
      delete inputValuesDiff[fieldName];
    } else {
      inputValueTypes.push(type);
    }
  }

  visit(document, {
    FieldDefinition: fieldVisitor,
    InputValueDefinition: inputValueVisitor,
    UnionTypeDefinition(node) {
      if (!node.types) return BREAK;
      for (const namedTypeNode of node.types) {
        const name = namedTypeNode.name.value;
        if (unionTypesDiff[name]) {
          delete unionTypesDiff[name];
        } else {
          unionTypesDiff[name] = true;
        }
      }
    },
    DirectiveDefinition(node) {
      node.locations.forEach(location => {
        const locationName = location.value;
        // If a location already exists in the Set, then we've seen it once.
        // This means we can remove it from the final diff, since both directives
        // have this location in common.
        if (locationsDiff.has(locationName)) {
          locationsDiff.delete(locationName);
        } else {
          locationsDiff.add(locationName);
        }
      });

      if (!node.arguments) return;

      // Arguments must have the same name and type. As matches are found, they
      // are deleted from the diff. Anything left in the diff after looping
      // represents a discrepancy between the two sets of arguments.
      node.arguments.forEach(argument => {
        const argumentName = argument.name.value;
        const printedType = print(argument.type);
        if (argumentsDiff[argumentName]) {
          if (printedType === argumentsDiff[argumentName][0]) {
            // If the existing entry is equal to printedType, it means there's no
            // diff, so we can remove the entry from the diff object
            delete argumentsDiff[argumentName];
          } else {
            argumentsDiff[argumentName].push(printedType);
          }
        } else {
          argumentsDiff[argumentName] = [printedType];
        }
      });
    },
  });

  const typeNameDiff =
    firstNode.name.value === secondNode.name.value
      ? []
      : [firstNode.name.value, secondNode.name.value];

  const kindDiff =
    firstNode.kind === secondNode.kind ? [] : [firstNode.kind, secondNode.kind];

  return {
    name: typeNameDiff,
    kind: kindDiff,
    fields: fieldsDiff,
    inputValues: inputValuesDiff,
    unionTypes: unionTypesDiff,
    locations: Array.from(locationsDiff),
    args: argumentsDiff,
  };
}

/**
 * A common implementation of diffTypeNodes to ensure two type nodes are equivalent
 *
 * @param firstNode TypeDefinitionNode | TypeExtensionNode | DirectiveDefinitionNode
 * @param secondNode TypeDefinitionNode | TypeExtensionNode | DirectiveDefinitionNode
 */
export function typeNodesAreEquivalent(
  firstNode: TypeDefinitionNode | TypeExtensionNode | DirectiveDefinitionNode,
  secondNode: TypeDefinitionNode | TypeExtensionNode | DirectiveDefinitionNode,
) {
  const { name, kind, fields, inputValues, unionTypes, locations, args } = diffTypeNodes(
    firstNode,
    secondNode,
  );

  return (
    name.length === 0 &&
    kind.length === 0 &&
    Object.keys(fields).length === 0 &&
    Object.keys(inputValues).length === 0 &&
    Object.keys(unionTypes).length === 0 &&
    locations.length === 0 &&
    Object.keys(args).length === 0
  );
}


export function findTypeNodeInServiceList(typeName: string, serviceName: string, serviceList: ServiceDefinition[]) {
  return serviceList.find(
    service => service.name === serviceName
    )?.typeDefs.definitions.find(
      definition =>
      'name' in definition
      && definition.name?.value === typeName
      );
}

/**
 * A map of `Kind`s from their definition to their respective extensions
 */
export const defKindToExtKind: { [kind: string]: string } = {
  [Kind.SCALAR_TYPE_DEFINITION]: Kind.SCALAR_TYPE_EXTENSION,
  [Kind.OBJECT_TYPE_DEFINITION]: Kind.OBJECT_TYPE_EXTENSION,
  [Kind.INTERFACE_TYPE_DEFINITION]: Kind.INTERFACE_TYPE_EXTENSION,
  [Kind.UNION_TYPE_DEFINITION]: Kind.UNION_TYPE_EXTENSION,
  [Kind.ENUM_TYPE_DEFINITION]: Kind.ENUM_TYPE_EXTENSION,
  [Kind.INPUT_OBJECT_TYPE_DEFINITION]: Kind.INPUT_OBJECT_TYPE_EXTENSION,
};

export const executableDirectiveLocations = [
  'QUERY',
  'MUTATION',
  'SUBSCRIPTION',
  'FIELD',
  'FRAGMENT_DEFINITION',
  'FRAGMENT_SPREAD',
  'INLINE_FRAGMENT',
  'VARIABLE_DEFINITION',
];

export const reservedRootFields = ['_service', '_entities'];

// Map of OperationTypeNode to its respective default root operation type name
export const defaultRootOperationNameLookup: {
  [node in OperationTypeNode]: DefaultRootOperationTypeName;
} = {
  query: 'Query',
  mutation: 'Mutation',
  subscription: 'Subscription',
};

export type CompositionResult = CompositionFailure | CompositionSuccess;

// Yes, it's a bit awkward that we still return a schema when errors occur.
// This is old behavior that I'm choosing not to modify for now.
export interface CompositionFailure {
  /** @deprecated Use supergraphSdl instead */
  schema: GraphQLSchema;
  errors: GraphQLError[];
  supergraphSdl?: undefined;
}

export interface CompositionSuccess {
  /** @deprecated Use supergraphSdl instead */
  schema: GraphQLSchema;
  supergraphSdl: string;
  errors?: undefined;
}

export function compositionHasErrors(
  compositionResult: CompositionResult,
): compositionResult is CompositionFailure {
  return 'errors' in compositionResult && !!compositionResult.errors;
}

// This assertion function should be used for the sake of convenient type refinement.
// It should not be depended on for causing a test to fail. If an error is thrown
// from here, its use should be reconsidered.
export function assertCompositionSuccess(
  compositionResult: CompositionResult,
  message?: string,
): asserts compositionResult is CompositionSuccess {
  if (compositionHasErrors(compositionResult)) {
    throw new Error(message || 'Unexpected test failure');
  }
}

// This assertion function should be used for the sake of convenient type refinement.
// It should not be depended on for causing a test to fail. If an error is thrown
// from here, its use should be reconsidered.
export function assertCompositionFailure(
  compositionResult: CompositionResult,
  message?: string,
): asserts compositionResult is CompositionFailure {
  if (!compositionHasErrors(compositionResult)) {
    throw new Error(message || 'Unexpected test failure');
  }
}

// This function is overloaded for 3 different input types. Each input type
// maps to a particular return type, hence the overload.
export function getFederationMetadata(obj: GraphQLNamedType): FederationType | undefined;
export function getFederationMetadata(obj: GraphQLField<any, any>): FederationField | undefined;
export function getFederationMetadata(obj: GraphQLDirective): FederationDirective | undefined;
export function getFederationMetadata(obj: any) {
  if (typeof obj === "undefined") return undefined;
  else if (isNamedType(obj)) return obj.extensions?.federation as FederationType | undefined;
  else if (isDirective(obj)) return obj.extensions?.federation as FederationDirective | undefined;
  else return obj.extensions?.federation as FederationField | undefined;
}
