import {
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
import { getFederationMetadataForField, getFederationMetadataForType, isEntityTypeMetadata } from "./composedSchema";
import { FieldSet, Scope } from "./FieldSet";
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

  newScope<TParent extends GraphQLCompositeType>(
    parentType: TParent,
    enclosingScope?: Scope<GraphQLCompositeType>,
  ): Scope<TParent> {
    return {
      parentType,
      possibleTypes: enclosingScope
        ? this.getPossibleTypes(parentType).filter(type =>
            enclosingScope.possibleTypes.includes(type),
          )
        : this.getPossibleTypes(parentType),
      enclosingScope,
    };
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

  getKeyFields({
    parentType,
    serviceName,
    fetchAll = false,
  }: {
    parentType: GraphQLCompositeType;
    serviceName: string;
    fetchAll?: boolean;
  }): FieldSet {
    const keyFields: FieldSet = [];

    keyFields.push({
      scope: {
        parentType,
        possibleTypes: this.getPossibleTypes(parentType),
      },
      fieldNode: typenameField,
      fieldDef: TypeNameMetaFieldDef,
    });

    for (const possibleType of this.getPossibleTypes(parentType)) {
      const type = getFederationMetadataForType(possibleType);
      const keys =
        type && isEntityTypeMetadata(type)
          ? type.keys.get(serviceName)
          : undefined;

      if (!(keys && keys.length > 0)) continue;

      if (fetchAll) {
        keyFields.push(
          ...keys.flatMap(key =>
            this.collectFields(this.newScope(possibleType), {
              kind: Kind.SELECTION_SET,
              selections: key,
            }),
          ),
        );
      } else {
        keyFields.push(
          ...this.collectFields(this.newScope(possibleType), {
            kind: Kind.SELECTION_SET,
            selections: keys[0],
          }),
        );
      }
    }

    return keyFields;
  }

  getRequiredFields(
    parentType: GraphQLCompositeType,
    fieldDef: GraphQLField<any, any>,
    serviceName: string,
  ): FieldSet {
    const requiredFields: FieldSet = [];

    requiredFields.push(...this.getKeyFields({ parentType, serviceName }));

    const fieldFederationMetadata = getFederationMetadataForField(fieldDef);
    if (fieldFederationMetadata?.requires) {
      requiredFields.push(
        ...this.collectFields(this.newScope(parentType), {
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

    providedFields.push(
      ...this.getKeyFields({
        parentType: returnType,
        serviceName,
        fetchAll: true,
      }),
    );

    const fieldFederationMetadata = getFederationMetadataForField(fieldDef);
    if (fieldFederationMetadata?.provides) {
      providedFields.push(
        ...this.collectFields(this.newScope(returnType), {
          kind: Kind.SELECTION_SET,
          selections: fieldFederationMetadata.provides,
        }),
      );
    }

    return providedFields;
  }

  private getFragmentCondition(
    scope: Scope<GraphQLCompositeType>,
    fragment: FragmentDefinitionNode | InlineFragmentNode,
  ): GraphQLCompositeType {
    const typeConditionNode = fragment.typeCondition;
    if (!typeConditionNode) return scope.parentType;

    return typeFromAST(
      this.schema,
      typeConditionNode,
    ) as GraphQLCompositeType;
  }

  /**
   * Collects the top-level fields for the provided selection set into a `FieldSet`.
   *
   * This method does not recuse into the selection sets of the collected fields.
   *
   * @param scope - the scope of the provided selection set.
   * @param selectionSet - the selection set with fields to collect.
   * @param fields - the array to which the collected fields are added.
   */
  collectFields(
    scope: Scope<GraphQLCompositeType>,
    selectionSet: SelectionSetNode,
    fields: FieldSet = [],
    visitedFragmentNames: { [fragmentName: string]: boolean } = Object.create(null)
  ): FieldSet {
    for (const selection of selectionSet.selections) {
      switch (selection.kind) {
        case Kind.FIELD:
          const fieldDef = this.getFieldDef(scope.parentType, selection);
          fields.push({ scope, fieldNode: selection, fieldDef });
          break;
        case Kind.INLINE_FRAGMENT: {
          const newScope = this.newScope(this.getFragmentCondition(scope, selection), scope);
          if (newScope.possibleTypes.length === 0) {
            break;
          }

          newScope.directives = selection.directives;

          this.collectFields(
            newScope,
            selection.selectionSet,
            fields,
            visitedFragmentNames,
          );
          break;
        }
        case Kind.FRAGMENT_SPREAD:
          const fragmentName = selection.name.value;

          const fragment = this.fragments[fragmentName];
          if (!fragment) {
            continue;
          }

          const newScope = this.newScope(this.getFragmentCondition(scope, fragment), scope);
          if (newScope.possibleTypes.length === 0) {
            continue;
          }

          if (visitedFragmentNames[fragmentName]) {
            continue;
          }
          visitedFragmentNames[fragmentName] = true;

          this.collectFields(
            newScope,
            fragment.selectionSet,
            fields,
            visitedFragmentNames,
          );
          break;
      }
    }
    return fields;
  }
}
