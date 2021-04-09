import {
  DirectiveNode,
  DocumentNode,
  FieldNode,
  FragmentDefinitionNode,
  getNamedType,
  GraphQLAbstractType,
  GraphQLCompositeType,
  GraphQLError,
  GraphQLField,
  GraphQLObjectType,
  GraphQLSchema,
  InlineFragmentNode,
  isAbstractType,
  isCompositeType,
  Kind,
  OperationDefinitionNode,
  SelectionSetNode,
  typeFromAST,
  TypeNameMetaFieldDef,
  VariableDefinitionNode,
  visit
} from "graphql";
import { FragmentMap } from "./buildQueryPlan";
import {
  getFederationMetadataForField,
  getFederationMetadataForType,
  isEntityTypeMetadata
} from "./composedSchema";
import { FieldSet } from "./FieldSet";
import { Scope } from "./Scope";
import { getFieldDef } from "./utilities/graphql";

const typenameField = {
  kind: Kind.FIELD,
  name: {
    kind: Kind.NAME,
    value: TypeNameMetaFieldDef.name,
  },
};

/**
 * Context objects used during query planning.
 */
export class QueryPlanningContext {
  public internalFragments: Map<
    string, {
      name: string;
      definition: FragmentDefinitionNode;
      selectionSet: SelectionSetNode;
    }
  > = new Map();

  public internalFragmentCount = 0;

  protected variableDefinitions: {
    [name: string]: VariableDefinitionNode;
  };

  constructor(
    public readonly schema: GraphQLSchema,
    public readonly operation: OperationDefinitionNode,
    public readonly fragments: FragmentMap,
    public readonly autoFragmentization: boolean,
  ) {
    this.variableDefinitions = Object.create(null);
    visit(operation, {
      VariableDefinition: definition => {
        this.variableDefinitions[definition.variable.name.value] = definition;
      },
    });
  }

  getFieldDef(parentType: GraphQLCompositeType, fieldNode: FieldNode) {
    const fieldName = fieldNode.name.value;

    const fieldDef = getFieldDef(this.schema, parentType, fieldName);

    if (!fieldDef) {
      throw new GraphQLError(
        `Cannot query field "${fieldNode.name.value}" on type "${String(
          parentType,
        )}"`,
        fieldNode,
      );
    }

    return fieldDef;
  }

  getPossibleTypes(
    type: GraphQLAbstractType | GraphQLObjectType,
  ): ReadonlyArray<GraphQLObjectType> {
    return isAbstractType(type) ? this.schema.getPossibleTypes(type) : [type];
  }

  getVariableUsages(
    selectionSet: SelectionSetNode,
    fragments: Set<FragmentDefinitionNode>,
  ) {
    const usages: {
      [name: string]: VariableDefinitionNode;
    } = Object.create(null);

    // Construct a document of the selection set and fragment definitions so we
    // can visit them, adding all variable usages to the `usages` object.
    const document: DocumentNode = {
      kind: Kind.DOCUMENT,
      definitions: [
        { kind: Kind.OPERATION_DEFINITION, selectionSet, operation: 'query' },
        ...Array.from(fragments),
      ],
    };

    visit(document, {
      Variable: (node) => {
        usages[node.name.value] = this.variableDefinitions[node.name.value];
      },
    });

    return usages;
  }

  getBaseService(parentType: GraphQLObjectType): string | undefined {
    const type = getFederationMetadataForType(parentType);
    return (type && isEntityTypeMetadata(type)) ? type.graphName : undefined;
  }

  getOwningService(
    parentType: GraphQLObjectType,
    fieldDef: GraphQLField<any, any>,
  ): string | undefined {
    return (
      getFederationMetadataForField(fieldDef)?.graphName ??
      this.getBaseService(parentType)
    );
  }

  getKeyFields(
    scope: Scope,
    serviceName: string,
    fetchAll: boolean = false,
  ): FieldSet {
    const keyFields: FieldSet = [];

    keyFields.push({
      scope: scope,
      fieldNode: typenameField,
      fieldDef: TypeNameMetaFieldDef,
    });

    for (const possibleType of scope.possibleRuntimeTypes()) {
      const type = getFederationMetadataForType(possibleType);
      const keys =
        type && isEntityTypeMetadata(type)
          ? type.keys.get(serviceName)
          : undefined;

      if (!(keys && keys.length > 0)) continue;

      if (fetchAll) {
        keyFields.push(
          ...keys.flatMap(key =>
            this.collectFields(scope.refine(possibleType), {
              kind: Kind.SELECTION_SET,
              selections: key,
            }),
          ),
        );
      } else {
        keyFields.push(
          ...this.collectFields(scope.refine(possibleType), {
            kind: Kind.SELECTION_SET,
            selections: keys[0],
          }),
        );
      }
    }

    return keyFields;
  }

  getRequiredFields(
    scope: Scope,
    fieldDef: GraphQLField<any, any>,
    serviceName: string,
  ): FieldSet {
    const requiredFields: FieldSet = [];

    requiredFields.push(...this.getKeyFields(scope, serviceName));

    const fieldFederationMetadata = getFederationMetadataForField(fieldDef);
    if (fieldFederationMetadata?.requires) {
      requiredFields.push(
        ...this.collectFields(scope, {
          kind: Kind.SELECTION_SET,
          selections: fieldFederationMetadata.requires,
        }),
      );
    }

    return requiredFields;
  }

  getProvidedFields(
    fieldDef: GraphQLField<any, any>,
    serviceName: string,
  ): FieldSet {
    const returnType = getNamedType(fieldDef.type);
    if (!isCompositeType(returnType)) return [];

    const providedFields: FieldSet = [];

    providedFields.push(...this.getKeyFields(Scope.create(this, returnType), serviceName, true));

    const fieldFederationMetadata = getFederationMetadataForField(fieldDef);
    if (fieldFederationMetadata?.provides) {
      providedFields.push(
        ...this.collectFields(Scope.create(this, returnType), {
          kind: Kind.SELECTION_SET,
          selections: fieldFederationMetadata.provides,
        }),
      );
    }

    return providedFields;
  }

  private getFragmentCondition(
    parentType: GraphQLCompositeType,
    fragment: FragmentDefinitionNode | InlineFragmentNode,
  ): GraphQLCompositeType {
    const typeConditionNode = fragment.typeCondition;
    if (!typeConditionNode) return parentType;

    return typeFromAST(
      this.schema,
      typeConditionNode,
    ) as GraphQLCompositeType;
  }

  /**
   * Given a current scope and a new type condition (fragment spread or inline fragment), computes the scope
   * inside that new condition.
   *
   * Note that it is possible the new condition makes the branch unreachable (meaning that no possible
   * runtime types can implement/be part of the previous type condition (in the scope) and the new one).
   * In that case this method returns undefined and the branch should be ignored.
   *
   * @param currentScope - the current when the provided fragment (inline or spread) is reached.
   * @param fragment - the definition of a fragment being applied (a named or inline one).
   * @param appliedDirectives - potential directives being applied to the type condition this is called for.
   * @returns the new scope valid within the type condition provided as argument, or `undefined` if that
   * scope is "unreachable" (the new type condition, added to the pre-existing ones in `currentScope` cannot
   * match any runtime object).
   */
  private scopeForFragment(
    currentScope: Scope,
    fragment: FragmentDefinitionNode | InlineFragmentNode,
    appliedDirectives?: ReadonlyArray<DirectiveNode>
  ) : Scope | undefined {
    const condition = this.getFragmentCondition(currentScope.parentType, fragment);
    const newScope = currentScope.refine(condition, appliedDirectives);
    return (newScope.possibleRuntimeTypes().length == 0) ? undefined : newScope;
  }

  /**
   * Collects the top-level fields for the provided selection set into a `FieldSet`.
   *
   * This method does not recuse into the selection sets of the collected fields.
   *
   * @param scope - the scope of the provided selection set.
   * @param selectionSet - the selection set with fields to collect.
   * @param fields - the array to which the collected fields are added.
   * @returns the collected fields.
   */
  collectFields(
    scope: Scope,
    selectionSet: SelectionSetNode,
    fields: FieldSet = [],
  ): FieldSet {
    for (const selection of selectionSet.selections) {
      switch (selection.kind) {
        case Kind.FIELD:
          const fieldDef = this.getFieldDef(scope.parentType, selection);
          fields.push({ scope, fieldNode: selection, fieldDef });
          break;
        case Kind.INLINE_FRAGMENT: {
          const newScope = this.scopeForFragment(scope, selection, selection.directives);
          if (newScope) {
            this.collectFields(newScope, selection.selectionSet, fields);
          }
          break;
        }
        case Kind.FRAGMENT_SPREAD:
          const fragmentName = selection.name.value;

          const fragment = this.fragments[fragmentName];
          if (!fragment) {
            continue;
          }

          const newScope = this.scopeForFragment(scope, fragment, selection.directives);
          if (newScope) {
            this.collectFields(newScope, fragment.selectionSet, fields);
          }
          break;
      }
    }
    return fields;
  }
}
