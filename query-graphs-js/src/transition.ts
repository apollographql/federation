import { FieldDefinition, SelectableType } from "@apollo/core";

export type Transition = FieldCollection | DownCast | KeyResolution | FreeTransition;

export class KeyResolution {
  readonly kind = 'KeyResolution' as const;
  readonly collectOperationElements = false as const;

  constructor() {
  }

  toString() {
    return 'key()';
  }
}

export class FieldCollection {
  readonly kind = 'FieldCollection' as const;
  readonly collectOperationElements = true as const;

  constructor(readonly definition: FieldDefinition<any>) {}

  toString() {
    return this.definition.name;
  }
}

export class DownCast {
  readonly kind = 'DownCast' as const;
  readonly collectOperationElements = true as const;

  constructor(readonly sourceType: SelectableType, readonly castedType: SelectableType) {}

  toString() {
    return '... on ' + this.castedType.name;
  }
}

export class FreeTransition {
  readonly kind = 'FreeTransition' as const;
  readonly collectOperationElements = false as const;

  toString() {
    return '∅';
  }
}

export const freeTransition = new FreeTransition();

