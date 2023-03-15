import {
  assert,
  Directive,
  isNonEmptyArray,
  isVariable,
  NonEmptyArray,
  OperationElement,
  Selection,
  selectionOfElement,
  SelectionSet,
  Variable,
  VariableDefinitions
} from "@apollo/federation-internals";
import { extractOperationConditionals } from "@apollo/query-graphs";
import { ConditionNode } from ".";

export type VariableCondition = {
  variable: Variable,
  negated: boolean,
}

export type Condition = VariableCondition | boolean;

// The invariant maintained on this type are that if is an array of variable conditions, then:
// 1. that array is not empty (it has at least one condition).
// 2. that array has at most one condition for any given variable name.
export type Conditions = NonEmptyArray<VariableCondition> | boolean;

export function isConstantCondition(cond: Condition | Conditions): cond is boolean {
  return typeof cond === 'boolean';
}

export function mergeConditions(conditions1: Conditions, conditions2: Conditions): Conditions {
  if (isConstantCondition(conditions1)) {
    return conditions1 ? conditions2 : false;
  }
  if (isConstantCondition(conditions2)) {
    return conditions2 ? conditions1 : false;
  }

  // `Conditions` needs to maintains the invariant that it can have only a single `VariableCondition` for a given variable name.
  // So we start with `conditions1`, and then adds all of `conditions2` but for condition that are already in `conditions1`. For
  // those, if the negation is the same, then we just ignore the condition from `conditions2` (keeping only the one from `conditions1`).
  // But if the negation is opposite, then it means the whole conditions are impossible and we just return false.
  const merged: NonEmptyArray<VariableCondition> = [...conditions1];
  for (const cond2 of conditions2) {
    const cond1 = conditions1.find((c1) => c1.variable.name === cond2.variable.name);
    if (cond1) {
      if (cond1.negated !== cond2.negated) {
        return false;
      }
    } else {
      merged.push(cond2);
    }
  }
  return merged;
}

function sameConditions(conditions1: Conditions, conditions2: Conditions): boolean {
  if (isConstantCondition(conditions1)) {
    return isConstantCondition(conditions2) && conditions1 === conditions2;
  }
  if (isConstantCondition(conditions2)) {
    return false;
  }
  // We treat the array of variable conditions as a set, because that's what it is really.
  return conditions1.length === conditions2.length
    && conditions1.every((cond1) => conditions2.some((cond2) => cond1.variable.name === cond2.variable.name && cond1.negated === cond2.negated));
}

export function conditionsOfSelectionSet(selectionSet: SelectionSet): Conditions {
  // If the conditions of all the selections within the set are the same, then those are conditions of the whole set
  // and we return it. Otherwise, we just return `true` (which essentially translate to "that selection always need
  // to be queried"). Note that for the case where the set has only 1 selection, then this just mean we return
  // the condition of that one selection. Also note that in theory we could be a tad more precise, and when
  // all the selections have variable conditions, we could return the intersection of all of them, but
  // we don't bother for now as that has probably extremely rarely an impact in practice.
  const selections = selectionSet.selections();
  if (selections.length === 0) {
    // we shouldn't really get here for well-formed selection, so whether we return true or false doesn't matter
    // too much, but in principle, if there is no selection, we should be cool not including it.
    return false;
  }
  const conditions = conditionsOfSelection(selections[0]);
  for (let i = 1; i < selections.length; i++) {
    const otherConditions = conditionsOfSelection(selections[i]);
    if (!sameConditions(conditions, otherConditions)) {
      return true;
    }
  }
  return conditions;
}

function conditionsOfSelection(selection: Selection): Conditions {
  const elementConditions = conditionsOfElement(selection.element);
  if (!selection.selectionSet) {
    return elementConditions;
  }

  if (isConstantCondition(elementConditions)) {
    // If we get a constant, and it's `false`, then it means that element is never
    // included and no point in recursing, we can return false immediately.
    //
    // If it's `true`, then it means that element is included. If it is a field,
    // then we should also stop and return `true`, because no matter what the
    // sub-selection is, we need to get that field. But if it's a fragment, it
    // doesn't really select anything by itself, so we can recurse in that case.
    if (!elementConditions || selection.kind === 'FieldSelection') {
      return elementConditions;
    }
  }

  const selectionConditions = conditionsOfSelectionSet(selection.selectionSet);
  return mergeConditions(elementConditions, selectionConditions);
}

function conditionsOfElement(element: OperationElement): Conditions {
  const conditionals = extractOperationConditionals(element);
  if (conditionals.length === 0) {
    return true;
  }
  const conditions: VariableCondition[] = [];
  for (const conditional of conditionals) {
    const value = conditional.value;
    if (typeof value === 'boolean') {
      // We want to "resolve" @include/@skip that have a constant value. If that constant value means skipping
      // (so 'skip' + true or 'include' + false), then we can skip the whole element (return `false`). But
      // it it means "always include" then it's a useless condition we can ignore.
      if (value === (conditional.kind === 'skip')) {
        return false;
      }
    } else {
      conditions.push({
        variable: value,
        negated: conditional.kind === 'skip',
      });
    }
  }

  if (isNonEmptyArray(conditions)) {
    // Technically, users are not forbidden to write something useless like:
    //   ... on X @include(if: $x) @skip(if: $x)
    // so if we want to maintain our invariant on `Conditions` that a variable only appear once, we need to check for
    // that case manually.
    if (conditions.length === 2 && conditions[0].variable.name === conditions[1].variable.name) {
      // Note that neither @include or @skip are repeatable, so this is necessarily a @skip and an @include on the
      // same variable, and this mean this element is always excluded.
      return false;
    }
    return conditions;
  }

  return true;
}

export function updatedConditions(newConditions: Conditions, handledConditions: Conditions): Conditions {
  if (isConstantCondition(newConditions) || isConstantCondition(handledConditions)) {
    return newConditions;
  }

  const filtered: VariableCondition[] = [];
  for (const cond of newConditions) {
    const handledCond = handledConditions.find((r) => cond.variable.name === r.variable.name);
    if (handledCond) {
      // If we've already handled that exact condition, we can skip it.
      // But if we've already handled the _negation_ of this condition, then this mean the overall conditions
      // are unreachable and we can just return `false` directly.
      if (cond.negated !== handledCond.negated) {
        return false;
      }
    } else {
      filtered.push(cond);
    }
  }
  return isNonEmptyArray(filtered) ? filtered : true;
}

export function removeConditionsFromSelectionSet(selectionSet: SelectionSet, conditions: Conditions): SelectionSet {
  if (isConstantCondition(conditions)) {
    // If the conditions are the constant false, this means we know the selection will not be included
    // in the plan in practice, and it doesn't matter too much what we return here. So we just
    // the input unchanged as a shortcut.
    // If the conditions are the constant true, then it means we have no conditions to remove and we can
    // keep the selection "as is".
    return selectionSet;
  }

  return selectionSet.lazyMap((selection) => {
    // We remove any of the conditions on the element and recurse.
    const updatedElement = removeConditionsOfElement(selection.element, conditions);
    if (selection.selectionSet) {
      const updatedSelectionSet = removeConditionsFromSelectionSet(selection.selectionSet, conditions);
      if (updatedElement === selection.element) {
        if (updatedSelectionSet === selection.selectionSet) {
          return selection;
        } else {
          return selection.withUpdatedSelectionSet(updatedSelectionSet);
        }
      } else {
        return selectionOfElement(updatedElement, updatedSelectionSet);
      }
    } else {
      return updatedElement === selection.element ? selection : selectionOfElement(updatedElement);
    }
  });
}

function removeConditionsOfElement(element: OperationElement, conditions: VariableCondition[]): OperationElement {
  const updatedDirectives = (element.appliedDirectives as Directive<OperationElement>[]).filter((d) => !matchesConditionForKind(d, conditions, 'include') && !matchesConditionForKind(d, conditions, 'skip'));
  if (updatedDirectives.length === element.appliedDirectives.length) {
    return element;
  }
  return element.withUpdatedDirectives(updatedDirectives);
}

function matchesConditionForKind(
  directive: Directive<OperationElement>,
  conditions: VariableCondition[],
  kind: 'include' | 'skip'
): boolean {
  if (directive.name !== kind) {
    return false;
  }

  const value = directive.arguments()['if'];
  return !isVariable(value) || conditions.some((cond) => cond.variable.name === value.name && cond.negated === (kind === 'skip'));
}

/**
 * Evaluates the provided condition given variable definitions and concrete values.
 *
 * Note that this method allows the entry of `values` to be of `any` type, but this is only to make it possible
 * to call this method with all of the variables values of a query, but this method assumes that:
 *  1. `values` contains a value for `condition.condition`, _or_ the variable in question is defined with a default value.
 *  2. that the value found for the `condition.condition` variable (in `values`, or the default for the variable) is a boolean.
 */
export function evaluateCondition(
  condition: ConditionNode,
  variables: VariableDefinitions,
  values: Record<string, any> | undefined,
): boolean {
  const variable = condition.condition;
  let val = values ? values[variable] : undefined;
  if (val === undefined) {
    val = variables.definition(variable)?.defaultValue;
  }
  assert(val !== undefined, () => `Missing value for variable \$${variable} (and no default found)`);
  assert(typeof val === 'boolean', () => `Invalid non-boolean value ${val} for Boolean! variable \$${variable}`)
  return val;
}
