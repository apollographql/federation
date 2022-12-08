import { FieldDefinition, CompositeType, SchemaRootKind } from "@apollo/federation-internals";

/**
 * The type of query graphs edge "transitions".
 *
 * An edge transition encodes what the edges correspond to, in the underlying graphQL
 * schema.
 */
export type Transition =
  /**
   * A field: the edge goes from (a vertex for) the field parent type, to the field (base) type.
   */
  FieldCollection

  /**
   * A "downcast": the edges goes from an abstract type (interface or union) to a type that implements that abstract
   * type (for interfaces) or is a member of that abstract type (for unions)
   */
  | DownCast

  /**
   * A key, only found in "federated" query graphs: the edge goes from an entity type in a particular subgraph to the
   * same entity type but in another subgraph. Edge with key transition _must_ have `conditions` corresponding to the
   * key fields
   */
  | KeyResolution

  /**
   * A root type, only found in "federated" query graphs: the edge goes from a root type (query, mutation or subscription)
   * of a subgraph to the (same) root type of another subgraph. It encodes the fact that if a subgraph field returns a root
   * type, any subgraph can be queried from there.
   */
  | RootTypeResolution

  /**
   * A "subgraph entering" edge: this is a special case only used for the edges out of the root vertices of "federated"
   * query graphs. It does not correspond to any physical graphQL elements but can be understood as the fact that the gateway
   * is always free to start querying any of the subgraph services as needed.
   */
  | SubgraphEnteringTransition

  /**
   * A special "fake" downcast for an @interfaceObject type to an implementation, only found in "federated" query graphs:
   * this encodes the fact that an @interfaceObject type "stand-in" for any possible implementations (in the supergraph)
   * of the corresponding interface. It is "fake" because the corresponding edges stays on the @interfaceObject type (this
   * is also why the "casted type" is only a name: that casted type does not actually exists in the subgraph in which 
   * the corresponding edge will be found).
   */
  | InterfaceObjectFakeDownCast
;

export class KeyResolution {
  readonly kind = 'KeyResolution'
  readonly collectOperationElements = false;

  toString() {
    return 'key()';
  }
}

export class RootTypeResolution {
  readonly kind = 'RootTypeResolution';
  readonly collectOperationElements = false;

  constructor(readonly rootKind: SchemaRootKind) {
  }

  toString() {
    return this.rootKind + '()';
  }
}

export class FieldCollection {
  readonly kind = 'FieldCollection';
  readonly collectOperationElements = true;

  constructor(
    readonly definition: FieldDefinition<CompositeType>,
    readonly isPartOfProvide: boolean = false
  ) {}

  toString() {
    return this.definition.name;
  }
}

export class DownCast {
  readonly kind = 'DownCast';
  readonly collectOperationElements = true;

  constructor(readonly sourceType: CompositeType, readonly castedType: CompositeType) {}

  toString() {
    return '... on ' + this.castedType.name;
  }
}

export class SubgraphEnteringTransition {
  readonly kind = 'SubgraphEnteringTransition';
  readonly collectOperationElements = false;

  toString() {
    return '∅';
  }
}

export class InterfaceObjectFakeDownCast {
  readonly kind = 'InterfaceObjectFakeDownCast';
  readonly collectOperationElements = true;

  constructor(readonly sourceType: CompositeType, readonly castedTypeName: string) {}

  toString() {
    return '... on ' + this.castedTypeName;
  }
}

export const subgraphEnteringTransition = new SubgraphEnteringTransition();

