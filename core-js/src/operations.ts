import deepEqual from "deep-equal";
import {
  ArgumentNode,
  DirectiveNode,
  FieldNode,
  FragmentDefinitionNode,
  InlineFragmentNode,
  Kind,
  OperationDefinitionNode,
  parse,
  SelectionNode,
  SelectionSetNode
} from "graphql";
import {
  baseType,
  DirectiveTargetElement,
  FieldDefinition,
  InterfaceType,
  isInterfaceType,
  isLeafType,
  isNullableType,
  isObjectType,
  isUnionType,
  ObjectType,
  runtimeTypesIntersects,
  Schema,
  SchemaRootKind,
  Type,
  UnionType,
  mergeVariables,
  Variables,
  variablesInArguments,
  VariableDefinitions,
  variableDefinitionsFromAST
} from "./definitions";
import { MultiMap } from "./utils";
import { argumentsFromAST, isValidValue, valueToAST, valueToString } from "./values";

function buildError(message: string): Error {
  // Maybe not the right error for this?
  return new Error(message);
}

function validate(condition: any, message: string): asserts condition {
  if (!condition) {
    throw buildError(message);
  }
}

function haveSameDirectives<TElement extends OperationElement>(op1: TElement, op2: TElement): boolean {
  if (op1.appliedDirectives.length != op2.appliedDirectives.length) {
    return false;
  }

  for (const thisDirective of op1.appliedDirectives) {
    if (!op2.appliedDirectives.some(thatDirective => thisDirective.name === thatDirective.name && deepEqual(thisDirective.arguments(), thatDirective.arguments()))) {
      return false;
    }
  }
  return true;
}

class AbstractOperationElement<T extends AbstractOperationElement<T>> extends DirectiveTargetElement<T> {
  public readonly variables: Variables

  constructor(
    schema: Schema,
    variablesInElement: Variables
  ) {
    super(schema);
    this.variables = mergeVariables(variablesInElement, this.variablesInAppliedDirectives());
  }
}

export class Field<TArgs extends {[key: string]: any} = {[key: string]: any}> extends AbstractOperationElement<Field<TArgs>> {
  readonly kind = 'Field' as const;

  constructor(
    readonly definition: FieldDefinition<any>,
    readonly args: TArgs,
    readonly variableDefinitions: VariableDefinitions,
    readonly alias?: string
  ) {
    super(definition.schema()!, variablesInArguments(args));
    this.validate();
  }

  get name(): string {
    return this.definition.name;
  }

  responseName(): string {
    return this.alias ? this.alias : this.name;
  }

  get parentType(): ObjectType | InterfaceType {
    return this.definition.parent;
  }

  withUpdatedDefinition(newDefinition: FieldDefinition<any>): Field<TArgs> {
    const newField = new Field<TArgs>(newDefinition, this.args, this.variableDefinitions, this.alias);
    for (const directive of this.appliedDirectives) {
      newField.applyDirective(directive.definition!, directive.arguments());
    }
    return newField;
  }

  appliesTo(type: ObjectType | InterfaceType): boolean {
    const definition = type.field(this.name);
    return !!definition && this.selects(definition);
  }

  selects(definition: FieldDefinition<any>, assumeValid: boolean = false): boolean {
    // We've already validated that the field selects the definition on which it was built.
    if (definition == this.definition) {
      return true;
    }

    // This code largely mirrors validate, so we could generalize that and return false on exception, but this
    // method is called fairly often and that has been shown to impact peformance quite a lot. So a little
    // bit of code duplication is ok.
    if (this.name !== definition.name) {
      return false;
    }

    // We need to make sure the field has valid values for every non-optional argument.
    for (const argDef of definition.arguments()) {
      const appliedValue = this.args[argDef.name];
      if (appliedValue === undefined) {
        if (argDef.defaultValue === undefined && !isNullableType(argDef.type!)) {
          return false;
        }
      } else {
        if (!assumeValid && !isValidValue(appliedValue, argDef.type!, this.variableDefinitions)) {
          return false;
        }
      }
    }

    // We also make sure the field application does not have non-null values for field that are not part of the definition.
    if (!assumeValid) {
      for (const [name, value] of Object.entries(this.args)) {
        if (value !== null && definition.argument(name) === undefined) {
          return false
        }
      }
    }
    return true;
  }

  private validate() {
    validate(this.name === this.definition.name, `Field name "${this.name}" cannot select field "${this.definition.coordinate}: name mismatch"`);

    // We need to make sure the field has valid values for every non-optional argument.
    for (const argDef of this.definition.arguments()) {
      const appliedValue = this.args[argDef.name];
      if (appliedValue === undefined) {
        validate(
          argDef.defaultValue !== undefined || isNullableType(argDef.type!),
          `Missing mandatory value "${argDef.name}" in field selection "${this}"`);
      } else {
        validate(
          isValidValue(appliedValue, argDef.type!, this.variableDefinitions),
          `Invalid value ${valueToString(appliedValue)} for argument "${argDef.coordinate}" of type ${argDef.type}`)
      }
    }

    // We also make sure the field application does not have non-null values for field that are not part of the definition.
    for (const [name, value] of Object.entries(this.args)) {
      validate(
        value === null || this.definition.argument(name) !== undefined,
        `Unknown argument "${name}" in field application of "${this.name}"`);
    }
  }

  equals(that: OperationElement): boolean {
    if (this === that) {
      return true;
    }
    return that.kind === 'Field'
      && this.name === that.name
      && this.alias === that.alias
      && deepEqual(this.args, that.args)
      && haveSameDirectives(this, that);
  }

  toString(): string {
    const alias = this.alias ? this.alias + ': ' : '';
    const entries = Object.entries(this.args);
    const args = entries.length == 0 
      ? '' 
      : '(' + entries.map(([n, v]) => `${n}: ${valueToString(v)}`).join(', ') + ')';
    return alias + this.name + args + this.appliedDirectivesToString();
  }
}

export class FragmentElement extends AbstractOperationElement<FragmentElement> {
  readonly kind = 'FragmentElement' as const;
  readonly typeCondition?: SelectableType;

  constructor(
    private readonly sourceType: SelectableType,
    typeCondition?: string | SelectableType,
  ) {
    // TODO: we should do some validation here (remove the ! with proper error, and ensure we have some intersection between
    // the source type and the type condition)
    super(sourceType.schema()!, []);
    this.typeCondition = typeCondition !== undefined && typeof typeCondition === 'string'
      ? this.schema().type(typeCondition)! as SelectableType
      : typeCondition;
  }

  get parentType(): SelectableType {
    return this.sourceType;
  }

  withUpdatedSourceType(newSourceType: SelectableType): FragmentElement {
    const newFragment = new FragmentElement(newSourceType, this.typeCondition);
    for (const directive of this.appliedDirectives) {
      newFragment.applyDirective(directive.definition!, directive.arguments());
    }
    return newFragment;
  }

  equals(that: OperationElement): boolean {
    if (this === that) {
      return true;
    }
    return that.kind === 'FragmentElement'
      && this.typeCondition?.name === that.typeCondition?.name
      && haveSameDirectives(this, that);
  }

  toString(): string {
    return '...' + (this.typeCondition ? ' on ' + this.typeCondition : '') + this.appliedDirectivesToString();
  }
}

export type OperationElement = Field<any> | FragmentElement;

export type OperationPath = OperationElement[];

export type RootOperationPath = {
  rootKind: SchemaRootKind,
  path: OperationPath
}

export type SelectableType = ObjectType | InterfaceType | UnionType;

export function isSelectableType(type: Type): type is SelectableType {
  switch (type.kind) {
    case 'ObjectType':
    case 'InterfaceType':
    case 'UnionType':
      return true;
    default:
      return false;
  }
}

// TODO Operations can also have directives
export class Operation {
  constructor(
    readonly rootKind: SchemaRootKind,
    readonly selectionSet: SelectionSet,
    readonly variableDefinitions: VariableDefinitions,
    readonly name?: string) {
  }

  toString(): string {
    if (this.rootKind == "query" && !this.name && this.variableDefinitions.isEmpty) {
      return this.selectionSet.toString();
    }
    const nameAndVariables = this.name
      ? " " + (this.name + (this.variableDefinitions.isEmpty() ? "" : this.variableDefinitions.toString()))
      : (this.variableDefinitions.isEmpty() ? "" : " " + this.variableDefinitions.toString());
    return this.rootKind + nameAndVariables + " " + this.selectionSet;
  }
}

function elementKey(elt: OperationElement): string {
  return elt instanceof Field ? elt.responseName() : elt.typeCondition?.name ?? '';
}

function addDirectiveNodesToElement(directiveNodes: readonly DirectiveNode[] | undefined, element: OperationElement) {
  if (!directiveNodes) {
    return;
  }
  const schema = element.parentType.schema()!;
  for (const node of directiveNodes) {
    const directiveDef = schema.directive(node.name.value);
    validate(directiveDef, `Unknown directive "@${node.name.value}" in selection`)
    element.applyDirective(directiveDef, argumentsFromAST(node.arguments));
  }
}

export class SelectionSet {
  // The argument is either the responseName (for fields), or the type name (for fragments), with the empty string being used as a special
  // case for a fragment with no type condition.
  private readonly _selections = new MultiMap<string, Selection>();
  private _usedVariables: Variables;

  constructor(readonly parentType: SelectableType) {
    validate(!isLeafType(parentType), `Cannot have selection on non-leaf type ${parentType}`);
    this._usedVariables = [];
  }

  selections(): readonly Selection[] {
    return [...this._selections.values()].flat();
  }

  usedVariables(): Variables {
    return this._usedVariables;
  }

  mergeIn(selectionSet: SelectionSet) {
    for (const selection of selectionSet.selections()) {
      this.add(selection);
    }
  }

  add(selection: Selection): Selection {
    const toAdd = selection.updateForAddingTo(this);
    const key = elementKey(toAdd.element());
    let existing: Selection[] | undefined = this._selections.get(key);
    if (existing) {
      for (const existingSelection of existing) {
        if (existingSelection.kind === toAdd.kind && haveSameDirectives(existingSelection.element(), toAdd.element())) {
          // For field, the 'element key' is the response name. If 2 fields have same parent name (which they have) and the
          // same response name (which they have), then they must be the exact same field application.
          // Note that for fragments, this condition can never fail since the element key is the condition name and that's the only
          // thing of the equality we haven't already checked.
          validate(existingSelection.element().equals(toAdd.element()), `Field "${existingSelection}" and "${toAdd}" have the same response name but different name and/or arguments`);
          if (toAdd.selectionSet) {
            existingSelection.selectionSet!.mergeIn(toAdd.selectionSet);
            this._usedVariables = mergeVariables(this._usedVariables, toAdd.selectionSet.usedVariables());
          }
          return existingSelection;
        }
      }
    }
    this._selections.add(key, toAdd);
    this._usedVariables = mergeVariables(this._usedVariables, toAdd.usedVariables());
    return selection;
  }

  addPath(path: OperationPath) {
    let previousSelections: SelectionSet = this;
    let currentSelections: SelectionSet | undefined = this;
    for (const element of path) {
      validate(currentSelections, `Cannot apply selection ${element} to non-selectable parent type "${previousSelections.parentType}"`);
      const mergedSelection: Selection = currentSelections.add(selectionOfElement(element));
      previousSelections = currentSelections;
      currentSelections = mergedSelection.selectionSet;
    }
  }

  addSelectionSetNode(node: SelectionSetNode | undefined, variableDefinitions: VariableDefinitions, fragments: Map<string, FragmentDefinitionNode> = new Map()) {
    if (!node) {
      return;
    }
    for (const selectionNode of node.selections) {
      this.addSelectionNode(selectionNode, variableDefinitions, fragments);
    }
  }

  addSelectionNode(node: SelectionNode, variableDefinitions: VariableDefinitions, fragments: Map<string, FragmentDefinitionNode> = new Map()) {
    this.add(this.nodeToSelection(node, variableDefinitions, fragments));
  }

  private nodeToSelection(node: SelectionNode, variableDefinitions: VariableDefinitions, fragments: Map<string, FragmentDefinitionNode>): Selection {
    let selection: Selection;
    switch (node.kind) {
      case 'Field':
        validate(!isUnionType(this.parentType), `Cannot find field ${node.name.value} in union type ${this.parentType}`);
        const definition: FieldDefinition<any> | undefined  = this.parentType.field(node.name.value);
        validate(definition, `Cannot find field ${node.name.value} in type ${this.parentType}`);
        selection = new FieldSelection(new Field(definition, argumentsFromAST(node.arguments), variableDefinitions, node.alias?.value));
        if (node.selectionSet) {
          validate(selection.selectionSet, `Unexpected selection set on leaf field "${selection.element()}"`);
          selection.selectionSet.addSelectionSetNode(node.selectionSet, variableDefinitions);
        }
        break;
      case 'InlineFragment':
        selection = new FragmentSelection(new FragmentElement(this.parentType, node.typeCondition?.name.value));
        selection.selectionSet.addSelectionSetNode(node.selectionSet, variableDefinitions);
        break;
      case 'FragmentSpread':
        const fragmentName = node.name.value;
        const fragmentDef = fragments.get(fragmentName);
        validate(fragmentDef, `Unknown fragment "...${fragmentName}"`);
        selection = new FragmentSelection(new FragmentElement(this.parentType, fragmentDef.typeCondition.name.value));
        selection.selectionSet.addSelectionSetNode(fragmentDef.selectionSet, variableDefinitions);
        addDirectiveNodesToElement(fragmentDef.directives, selection.element());
        break;
    }
    addDirectiveNodesToElement(node.directives, selection.element());
    return selection;
  }

  equals(that: SelectionSet): boolean {
    if (this._selections.size !== that._selections.size) {
      return false;
    }

    for (const [key, thisSelections] of this._selections) {
      const thatSelections = that._selections.get(key);
      if (!thatSelections
        || thisSelections.length !== thatSelections.length
        || !thisSelections.every(thisSelection => thatSelections.some(thatSelection => thisSelection.equals(thatSelection)))
      ) {
        return false
      }
    }
    return true;
  }

  validate() {
    for (const selection of this.selections()) {
      selection.validate();
    }
  }

  isEmpty(): boolean {
    return this._selections.size === 0;
  }

  toSelectionSetNode(): SelectionSetNode {
    // In theory, for valid operations, we shouldn't have empty selection sets (field selections whose type is a leaf will
    // have an undefined selection set, not an empty one). We do "abuse" this a bit however when create query "witness"
    // during composition validation where, to make it easier for users to locate the issue, we want the created witness
    // query to stop where the validation problem lies, even if we're not on a leaf type. To make this look nice and
    // explicit, we handle that case by create a fake selection set that just contains an elipsis, indicate there is
    // supposed to be more but we elided it for clarity. And yes, the whole thing is a bit of a hack, albeit a convenient
    // one.
    if (this.isEmpty()) {
      return {
        kind: Kind.SELECTION_SET,
        selections: [{
          kind: 'Field',
          name: {
            kind: Kind.NAME,
            value: '...',
          },
        }]
      }
    }
    return {
      kind: Kind.SELECTION_SET,
      selections: Array.from(this.selections(), s => s.toSelectionNode())
    }
  }

  toOperationPaths(): OperationPath[] {
    return this.toOperationPathsInternal([]);
  }

  private toOperationPathsInternal(parentPaths: OperationPath[]): OperationPath[] {
    return this.selections().flatMap((selection) => {
      const updatedPaths = parentPaths.map(path => [...path, selection.element()]);
      return selection.selectionSet
        ? selection.selectionSet.toOperationPathsInternal(updatedPaths)
        : updatedPaths;
    });
  }

  clone(): SelectionSet {
    const cloned = new SelectionSet(this.parentType);
    for (const selection of this.selections()) {
      cloned.add(selection.clone());
    }
    return cloned;
  }

  toString(): string {
    return '{ ' + this.selections().join(' ') + ' }';
  }
}

export function selectionSetOfElement(element: OperationElement, subSelection?: SelectionSet): SelectionSet {
  const selectionSet = new SelectionSet(element.parentType);
  selectionSet.add(selectionOfElement(element, subSelection));
  return selectionSet;
}

export function selectionOfElement(element: OperationElement, subSelection?: SelectionSet): Selection {
  return element.kind === 'Field' ? new FieldSelection(element, subSelection) : new FragmentSelection(element, subSelection);
}

export function selectionSetOfPath(path: OperationPath, onPathEnd?: (finalSelectionSet: SelectionSet | undefined) => void): SelectionSet {
  validate(path.length > 0, `Cannot create a selection set from an empty path`);
  const last = selectionSetOfElement(path[path.length - 1]);
  let current = last;
  for (let i = path.length - 2; i >= 0; i--) {
    current = selectionSetOfElement(path[i], current);
  }
  if (onPathEnd) {
    onPathEnd(last.selections()[0].selectionSet);
  }
  return current;
}

export type Selection = FieldSelection | FragmentSelection;

export class FieldSelection {
  readonly kind = 'FieldSelection' as const;
  readonly selectionSet?: SelectionSet;

  constructor(
    readonly field: Field<any>,
    initialSelectionSet? : SelectionSet
  ) {
    const type = baseType(field.definition.type!);
    // Field types are output type, and a named typethat is an output one and isn't a leat is guaranteed to be selectable.
    this.selectionSet = isLeafType(type) ? undefined : (initialSelectionSet ? initialSelectionSet : new SelectionSet(type as SelectableType));
  }

  element(): Field<any> {
    return this.field;
  }

  usedVariables(): Variables {
    return mergeVariables(this.element().variables, this.selectionSet?.usedVariables() ?? []);
  }

  private fieldArgumentsToAST(): ArgumentNode[] | undefined {
    const entries = Object.entries(this.field.args);
    if (entries.length === 0) {
      return undefined;
    }

    return entries.map(([n, v]) => {
      return {
        kind: 'Argument',
        name: { kind: Kind.NAME, value: n },
        value: valueToAST(v, this.field.definition.argument(n)!.type!)!,
      };
    });
  }

  validate() {
    validate(
      !(this.selectionSet && this.selectionSet.isEmpty()),
      `Invalid empty selection set for field "${this.field.name}" of non-leaf type ${this.field.definition.type}`
    );
  }

  updateForAddingTo(selectionSet: SelectionSet): FieldSelection {
    const selectionParent = selectionSet.parentType;
    const fieldParent = this.field.definition.parent;
    if (selectionParent !== fieldParent) {
      // We accept adding a selection of an interface field to a selection of one of its subtype. But otherwise, it's invalid.
      // Do note that the field might come from a supergraph while the selection is on a subgraph, so we avoid relying on isDirectSubtype (because
      // isDirectSubtype relies on the subtype knowing which interface it implements, but the one of the subgraph might not declare implementing
      // the supergraph interface, even if it does in the subgraph).
      validate(
        !isUnionType(selectionParent) 
        && (
          (isInterfaceType(fieldParent) && fieldParent.allImplementations().some(i => i.name == selectionParent.name)) 
          || (isObjectType(fieldParent) && fieldParent.name == selectionParent.name)
        ),
        `Cannot add selection of field "${this.field.definition.coordinate}" to selection set of parent type "${selectionSet.parentType}"`
      );
      const fieldDef = selectionParent.field(this.field.name);
      validate(fieldDef, `Cannot add selection of field "${this.field.definition.coordinate}" to selection set of parent type "${selectionParent} (that does not declare that type)"`);
      return new FieldSelection(this.field.withUpdatedDefinition(fieldDef), this.selectionSet);
    }
    return this;
  }

  toSelectionNode(): FieldNode {
    return {
      kind: 'Field',
      name: {
        kind: Kind.NAME,
        value: this.field.name,
      },
      arguments: this.fieldArgumentsToAST(),
      directives: this.element().appliedDirectivesToDirectiveNodes(),
      selectionSet: this.selectionSet?.toSelectionSetNode()
    };
  }

  equals(that: Selection): boolean {
    if (!(that instanceof FieldSelection) || !this.field.equals(that.field)) {
      return false;
    }
    if (!this.selectionSet) {
      return !that.selectionSet;
    }
    return !!that.selectionSet && this.selectionSet.equals(that.selectionSet);
  }

  clone(): FieldSelection {
    if (!this.selectionSet) {
      return this;
    }
    return new FieldSelection(this.field, this.selectionSet.clone());
  }

  toString(): string {
    return this.field + (this.selectionSet ? ' ' + this.selectionSet : '');
  }
}

export class FragmentSelection {
  readonly kind = 'FragmentSelection' as const;
  readonly selectionSet: SelectionSet;

  constructor(
    readonly fragmentElement: FragmentElement,
    initialSelectionSet?: SelectionSet
  ) {
    // TODO: we should do validate the type of the initial selection set.
    this.selectionSet = initialSelectionSet
      ? initialSelectionSet
      : new SelectionSet(fragmentElement.typeCondition ? fragmentElement.typeCondition : fragmentElement.parentType);
  }

  element(): FragmentElement {
    return this.fragmentElement;
  }

  validate() {
    validate(
      !this.selectionSet.isEmpty(),
      `Invalid empty selection set for fragment "${this.fragmentElement}"}`
    );
  }

  usedVariables(): Variables {
    return mergeVariables(this.element().variables, this.selectionSet.usedVariables());
  }

  updateForAddingTo(selectionSet: SelectionSet): FragmentSelection {
    const selectionParent = selectionSet.parentType;
    const fragmentParent = this.fragmentElement.parentType;
    const typeCondition = this.fragmentElement.typeCondition;
    if (selectionParent != fragmentParent) {
      // As long as there an intersection between the type we cast into and the selection parent, it's ok.
      validate(
        !typeCondition || runtimeTypesIntersects(selectionParent, typeCondition),
        `Cannot add fragment of parent type "${this.fragmentElement.parentType}" to selection set of parent type "${selectionSet.parentType}"`
      );
      return new FragmentSelection(this.fragmentElement.withUpdatedSourceType(selectionParent), this.selectionSet);
    }
    return this;
  }

  toSelectionNode(): InlineFragmentNode {
    return {
      kind: Kind.INLINE_FRAGMENT,
      typeCondition: this.fragmentElement.typeCondition
        ? {
          kind: Kind.NAMED_TYPE,
          name: {
            kind: Kind.NAME,
            value: this.fragmentElement.typeCondition.name,
          },
        }
        : undefined,
      directives: this.fragmentElement.appliedDirectivesToDirectiveNodes(),
      selectionSet: this.selectionSet.toSelectionSetNode()
    };
  }

  equals(that: Selection): boolean {
    return (that instanceof FragmentSelection)
      && this.fragmentElement.equals(that.fragmentElement)
      && this.selectionSet.equals(that.selectionSet);
  }

  clone(): FragmentSelection {
    return new FragmentSelection(this.fragmentElement, this.selectionSet.clone());
  }

  toString(): string {
    return this.fragmentElement + ' ' + this.selectionSet;
  }
}

export function operationFromAST(
  schema: Schema,
  operation: OperationDefinitionNode,
  fragments?: Map<string, FragmentDefinitionNode>
) : Operation {
  const rootType = schema.schemaDefinition.root(operation.operation);
  validate(rootType, `The schema has no "${operation.operation}" root type defined`);
  const variableDefinitions = operation.variableDefinitions ? variableDefinitionsFromAST(schema, operation.variableDefinitions) : new VariableDefinitions();
  return new Operation(
    operation.operation,
    parseSelectionSet(rootType.type, operation.selectionSet, variableDefinitions, fragments),
    variableDefinitions,
    operation.name?.value
  );
}

export function parseOperation(schema: Schema, operation: string): Operation {
  return operationFromAST(schema, parseOperationAST(operation) );
}

export function parseSelectionSet(
  parentType: SelectableType,
  source: string | SelectionSetNode,
  variableDefinitions: VariableDefinitions = new VariableDefinitions(),
  fragments?: Map<string, FragmentDefinitionNode>
): SelectionSet {
  // TODO: we sould maybe allow the selection, when a string, to contain fragment definitions?
  const node = typeof source === 'string'
    ? parseOperationAST(source.trim().startsWith('{') ? source : `{${source}}`).selectionSet
    : source;
  const selectionSet = new SelectionSet(parentType);
  selectionSet.addSelectionSetNode(node, variableDefinitions, fragments);
  selectionSet.validate();
  return selectionSet;
}

function parseOperationAST(source: string): OperationDefinitionNode {
  const parsed = parse(source);
  validate(parsed.definitions.length === 1, 'Selections should contain a single definitions, found ' + parsed.definitions.length);
  const def = parsed.definitions[0];
  validate(def.kind === 'OperationDefinition', 'Expected an operation definition but got a ' + def.kind);
  return def;
}

export function operationToAST(operation: Operation): OperationDefinitionNode {
  return {
    kind: 'OperationDefinition',
    operation: operation.rootKind,
    selectionSet: operation.selectionSet.toSelectionSetNode(),
    variableDefinitions: operation.variableDefinitions.toVariableDefinitionNodes()
  };
}
