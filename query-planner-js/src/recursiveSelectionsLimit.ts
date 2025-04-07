import {
  assertUnreachable,
  FragmentSpreadSelection,
  Operation,
  SelectionSet
} from '@apollo/federation-internals';

const MAX_RECURSIVE_SELECTIONS = 10_000_000;

/**
 * Measures the number of selections that would be encountered if we walked
 * the given selection set while recursing into fragment spreads. Returns
 * `null` if this number exceeds `MAX_RECURSIVE_SELECTIONS`.
 * 
 * Assumes that fragments referenced by spreads exist and don't form cycles. If
 * If a fragment spread appears multiple times for the same named fragment, it
 * is counted multiple times.
 */
function countRecursiveSelections(
  operation: Operation,
  fragmentCache: Map<string, number>,
  selectionSet: SelectionSet,
  count: number,
): number | null {
  for (const selection of selectionSet.selections()) {
    // Add 1 for the current selection and check bounds.
    count++;
    if (count > MAX_RECURSIVE_SELECTIONS) {
      return null;
    }

    switch (selection.kind) {
      case 'FieldSelection': {
        if (selection.selectionSet) {
          const result = countRecursiveSelections(
            operation,
            fragmentCache,
            selection.selectionSet,
            count,
          );
          if (result === null) return null;
          count = result;
        }
        break;
      }
      case 'FragmentSelection': {
        if (selection instanceof FragmentSpreadSelection) {
          const name = selection.namedFragment.name;
          const cached = fragmentCache.get(name);

          if (cached !== undefined) {
            count = count + cached;
            if (count > MAX_RECURSIVE_SELECTIONS) {
              return null;
            }
          } else {
            const oldCount = count;
            const result = countRecursiveSelections(
              operation,
              fragmentCache,
              selection.selectionSet,
              count,
            );
            if (result === null) return null;
            count = result;
            fragmentCache.set(name, count - oldCount);
          }
        } else { // Inline fragment
          const result = countRecursiveSelections(
            operation,
            fragmentCache,
            selection.selectionSet,
            count,
          );
          if (result === null) return null;
          count = result;
        }
        break;
      }
      default:
        assertUnreachable(selection);
    }
  }
  
  return count;
}

export function validateRecursiveSelections(
  operation: Operation,
) {
  const fragmentCache = new Map<string, number>();
  const result = countRecursiveSelections(
    operation,
    fragmentCache,
    operation.selectionSet,
    0);
  if (result === null) {
    throw new Error('Exceeded maximum recursive selections in this operation');
  }
};
