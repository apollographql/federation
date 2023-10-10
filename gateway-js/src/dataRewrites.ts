import { FetchDataRewrite } from "@apollo/query-planner";
import { assert } from "@apollo/federation-internals";
import { GraphQLSchema, isAbstractType, isInterfaceType, isObjectType } from "graphql";

const FRAGMENT_PREFIX = '... on ';

export function applyRewrites(schema: GraphQLSchema, rewrites: FetchDataRewrite[] | undefined,  value: Record<string, any>) {
  if (!rewrites) {
    return;
  }

  for (const rewrite of rewrites) {
    applyRewrite(schema, rewrite, value);
  }
}

function applyRewrite(schema: GraphQLSchema, rewrite: FetchDataRewrite,  value: Record<string, any>) {
  const splitted = splitPathLastElement(rewrite.path);
  if (!splitted) {
    return;
  }

  const [parent, last] = splitted;
  const { kind, value: fieldName } = parsePathElement(last);
  // So far, all rewrites finish by a field name. If this ever changes, this assertion will catch it early and we can update.
  assert(kind === 'fieldName', () => `Unexpected fragment as last element of ${rewrite.path}`);
  applyAtPath(schema, parent, value, rewriteAtPathFunction(rewrite, fieldName));
}

function rewriteAtPathFunction(rewrite: FetchDataRewrite, fieldAtPath: string): (obj: Record<string, any>) => void {
  switch (rewrite.kind) {
    case 'ValueSetter':
      return (obj) => {
        obj[fieldAtPath] = rewrite.setValueTo;
      };
    case 'KeyRenamer':
      return (obj) => {
        const objAtPath = obj[fieldAtPath];
        if (objAtPath) {
          obj[rewrite.renameKeyTo] = obj[fieldAtPath];
          obj[fieldAtPath] = undefined;
        }
      };
  }
}


/**
 * Given a path, separates the last element of path and the rest of it and return them as a pair.
 * This will return `undefined` if the path is empty.
 */
function splitPathLastElement(path: string[]): [string[], string] | undefined {
  if (path.length === 0) {
    return undefined;
  }

  const lastIdx = path.length - 1;
  return [path.slice(0, lastIdx), path[lastIdx]];
}

function applyAtPath(schema: GraphQLSchema, path: string[], value: any, fct: (objAtPath: Record<string, any>) => void) {
  if (Array.isArray(value)) {
    for (const arrayValue of value) {
      applyAtPath(schema, path, arrayValue, fct);
    }
    return;
  }

  if (typeof value !== 'object' || value === null) {
    return;
  }

  if (path.length === 0) {
    fct(value);
    return;
  }

  const [first, ...rest] = path;
  const { kind, value: eltValue } = parsePathElement(first);
  switch (kind) {
    case 'fieldName':
      applyAtPath(schema, rest, value[eltValue], fct);
      break;
    case 'typeName':
      // When we apply rewrites, we don't always have the __typename of all object we would need to, but the code expects that
      // this does not stop the rewrite to applying, hence the modified to `true` when the object typename is not found.
      if (isObjectOfType(schema, value, eltValue, true)) {
        applyAtPath(schema, rest, value, fct);
      }
      break;
  }
}

function parsePathElement(elt: string): { kind: 'fieldName' | 'typeName', value: string } {
  if (elt.startsWith(FRAGMENT_PREFIX)) {
    return { kind: 'typeName', value: elt.slice(FRAGMENT_PREFIX.length) };
  } else {
    return { kind: 'fieldName', value: elt };
  }
}


export function isObjectOfType(
  schema: GraphQLSchema,
  obj: Record<string, any>,
  typeCondition: string,
  defaultOnUnknownObjectType: boolean = false,
): boolean {
  const objTypename = obj['__typename'];
  if (!objTypename) {
    return defaultOnUnknownObjectType;
  }

  if (typeCondition === objTypename) {
    return true;
  }

  const type = schema.getType(objTypename);
  if (!type) {
    return false;
  }

  const conditionalType = schema.getType(typeCondition);
  if (!conditionalType) {
    return false;
  }

  if (isAbstractType(conditionalType)) {
    return (isObjectType(type) || isInterfaceType(type)) && schema.isSubType(conditionalType, type);
  }

  return false;
}
