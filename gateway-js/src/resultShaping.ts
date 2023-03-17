import {
  assert,
  CompositeType,
  Directive,
  ERRORS,
  FieldSelection,
  isCompositeType,
  isListType,
  isNonNullType,
  isObjectType,
  isSubtype,
  isValidLeafValue,
  Operation,
  OperationElement,
  OutputType,
  Schema,
  SelectionSet,
  Type,
  typenameFieldName,
  Variable
} from "@apollo/federation-internals";
import { ResponsePath } from "@apollo/query-planner";
import { GraphQLError } from "graphql";

/**
 * Performs post-query plan execution processing of internally fetched data to produce the final query response.
 *
 * The reason for this post-processing are the following ones:
 * 1. executing the query plan will usually query more fields that are strictly requested. That is because key, required
 *   and __typename fields must often be requested to subgraphs even when they are not part of the query. So this method
 *   will filter out anything that has been fetched but isn't part of the user query.
 * 2. query plan execution does not guarantee that in the data fetched, the fields will respect the ordering that the
 *   GraphQL spec defines (for the query). The reason for that being that as we fetch data from multiple subgraphs, we
 *   have to "destroy" the ordering to an extend, and that order has to be re-establish as a post-fetches step, and it's
 *   a lot easier to do this as part of this final post-processing step.
 * 3. query plan execution ignores schema introspection sub-parts as those are not something to be asked to subgraphs,
 *  and so any requested introspection needs to be added separatly from query plan execution. Note that this method
 *  does add introspection results to the final response returned, but it delegates the computation of introspect to
 *  its `introspectionHandling` callback.
 * 4. query plans do not request the __typename of root types to subgraphs, even if those are queried. The reason is
 *  that subgraph are allowed to use non-standard root type names, but the supergraph always use the standard name,
 *  so asking the subgraph for __typename on those type may actually return an incorrect result. This method
 *  compelets those __typename of root types if necessary.
 *
 * @param operation - the query that was planned and for which we're post-processing the result.
 * @param variables - the value for the variables in `operation`.
 * @param input - the data fetched during query plan execution and that should be filtered/re-ordered.
 * @param instrospectionHandling - a function that, given the selection of a schema introspection field (`__schema`)
 *   returns the introspection results for that field. This method does not handle introspection by itself, and
 *   so if some introspection is requested (`__schema` or `__type` only , `__typename` *is* handled by this method),
 *   this function is called to compute the proper result.
 */
export function computeResponse({
  operation,
  variables,
  input,
  introspectionHandling,
}: {
  operation: Operation,
  variables?: Record<string, any>,
  input: Record<string, any> | null | undefined,
  introspectionHandling: (introspectionSelection: FieldSelection) => any,
}): {
  data: Record<string, any> | null | undefined,
  errors: GraphQLError[],
} {
  if (!input) {
    return { data: input, errors: [] };
  }

  const parameters = {
    schema: operation.schema,
    variables: {
      ...operation.collectDefaultedVariableValues(),
      // overwrite any defaulted variables if they are provided
      ...variables,
    },
    errors: [],
    introspectionHandling,
  };

  const data = Object.create(null);

  const res = applySelectionSet({
    input,
    selectionSet: operation.selectionSet,
    output: data,
    parameters,
    path: [],
    parentType: operation.schema.schemaDefinition.rootType(operation.rootKind)!,
  });

  return {
    data: res === ApplyResult.NULL_BUBBLE_UP ? null : data,
    errors: parameters.errors,
  };
}

type Parameters = {
  schema: Schema,
  variables: Record<string, any>,
  errors: GraphQLError[],
  introspectionHandling: (introspectionSelection: FieldSelection) => any,
}


function shouldSkip(element: OperationElement, parameters: Parameters): boolean {
  const skipDirective = element.appliedDirectivesOf(parameters.schema.skipDirective())[0];
  const includeDirective = element.appliedDirectivesOf(parameters.schema.includeDirective())[0];
  return (skipDirective && ifValue(skipDirective, parameters.variables))
    || (includeDirective && !ifValue(includeDirective, parameters.variables));
}

function ifValue(directive: Directive<any, { if: boolean | Variable }>, variables: Record<string, any>): boolean {
  const ifArg = directive.arguments().if;
  if (ifArg instanceof Variable) {
    const value = variables[ifArg.name];
    // If the query has been validated, which we assume, the value must exists and be a boolean
    assert(value !== undefined && typeof value === 'boolean', () => `Unexpected value ${value} for variable ${ifArg} of ${directive}`);
    return value;
  } else {
    return ifArg;
  }
}

enum ApplyResult { OK, NULL_BUBBLE_UP }

function typeConditionApplies(
  schema: Schema,
  typeCondition: CompositeType | undefined,
  typename: string | undefined,
  parentType: CompositeType,
): boolean {
  if (!typeCondition) {
    return true;
  }

  if (typename) {
    const type = schema.type(typename);
    return !!type && isSubtype(typeCondition, type);
  } else {
    // No __typename, just check that the condition matches the parent type (unsure this is necessary as the query wouldn't have
    // been valid otherwise but ...).
    return isSubtype(typeCondition, parentType);
  }
}

function applySelectionSet({
  input,
  selectionSet,
  output,
  parameters,
  path,
  parentType,
}: {
  input: Record<string, any>,
  selectionSet: SelectionSet,
  output: Record<string, any>,
  parameters: Parameters,
  path: ResponsePath,
  parentType: CompositeType,
}): ApplyResult {
  for (const selection of selectionSet.selections()) {
    if (shouldSkip(selection.element, parameters)) {
      continue;
    }

    if (selection.kind === 'FieldSelection') {
      const field = selection.element;
      const fieldType = field.definition.type!;
      const responseName = field.responseName();
      const outputValue = output[responseName];

      if (field.definition.isSchemaIntrospectionField()) {
        if (outputValue === undefined) {
          output[responseName] = parameters.introspectionHandling(selection);
        }
        continue;
      }

      let inputValue = input[responseName] ?? null;

      // We handle __typename separately because there is some cases where the internal data may either not have
      // the value (despite __typename always having a value), or an actually incorrect value that should not be
      // returned. More specifically, this is due to 2 things at the moment:
      // 1. it is allowed for subgraphs to use custom names for root types, and different subgraphs can even use
      //   different names, but the supergraph will always use the default names (`Mutation` or `Query`). But it
      //   means that if we ask a subgraph for the __typename of a root type, the returned value may well be
      //   incorrect. In fact, to work around this, the query planner does not query the __typename of root
      //   types from subgraphs, and this is why this needs to be handled now.
      // 2. @interfaceObject makes it so that some subgraph may know what is an interface type in the supergraph
      //   as an object type locally. When __typename is used to such subgraph, it will thus return what is an
      //   interface type name for the supergraph and is thus invalid. Now, if __typename is explicitly queried
      //   (the case we're handling here) then the query planner will ensure in the query plan that after having
      //   queried a subgraph with @interfaceObject, we always follow that with a query to another subgraph
      //   having the type as an interface (and a @key on it), so as to "override" the __typename with the
      //   correct implementation type. _However_, that later fetch could fail, and when that is the case,
      //   the incorrect __typename will be incorrect. In that case, we must return it but instead should make
      //   the whole object null.
      if (field.name === typenameFieldName) {
        // If we've already set outputValue, we've already run this logic and are just dealing with a repeated
        // fragments, so just continue with the rest of the selections.
        if (outputValue === undefined) {
          // Note that this could an aliasing of __typename. If so, we've checked the input for the alias, but
          // if we found nothing it's worth double check if we don't have the __typename unaliased.
          // Note(Sylvain): unsure if there is real situation where this would help but it's cheap to check
          // and it's pretty logical to try so...
          if (inputValue === null && responseName !== typenameFieldName) {
            inputValue = input[typenameFieldName] ?? null;
          }

          // We're using the type pointed by our input value if there is one and it points to a genuine
          // type of the schema. Otherwise, we default to our parent type.
          const type = inputValue !== null && typeof inputValue === 'string'
            ? parameters.schema.type(inputValue) ?? parentType
            : parentType;

          // If if that type is not an object, then we cannot use it and our only option is to nullify
          // the whole object.
          if (!isObjectType(type)) {
            return ApplyResult.NULL_BUBBLE_UP;
          }
          output[responseName] = type.name;
        }
        continue;
      }

      path.push(responseName);
      const { updated, isInvalid } = updateOutputValue({
        outputValue,
        type: fieldType,
        inputValue,
        selectionSet: selection.selectionSet,
        path,
        parameters,
        parentType,
      });
      output[responseName] = updated
      path.pop();
      if (isInvalid) {
        return ApplyResult.NULL_BUBBLE_UP;
      }
    } else {
      const fragment = selection.element;
      const typename = input[typenameFieldName];
      assert(!typename || typeof typename === 'string', () => `Got unexpected value for __typename: ${typename}`);
      if (typeConditionApplies(parameters.schema, fragment.typeCondition, typename, parentType)) {
        const res = applySelectionSet({
          input,
          selectionSet: selection.selectionSet,
          output,
          parameters,
          path,
          parentType: fragment.typeCondition ?? parentType,
        });
        if (res === ApplyResult.NULL_BUBBLE_UP) {
          return ApplyResult.NULL_BUBBLE_UP;
        }
      }
    }
  }

  return ApplyResult.OK;
}

function pathLastElementDescription(path: ResponsePath, currentType: Type, parentType: CompositeType): string {
  const element = path[path.length - 1];
  assert(element !== undefined, 'Should not have been called on an empty path');
  return typeof element === 'string'
    ? `field ${parentType}.${element}`
    : `array element of type ${currentType} at index ${element}`;
}

/**
 * Given some partially computed output value (`outputValue`, possibly `undefined`) for a given `type` and the
 * corresponding input value (`inputValue`, which should never be `undefined` for this method, but can be `null`),
 * computes an updated output value for applying the provided `selectionSet` as sub-selection.
 */
function updateOutputValue({
  outputValue,
  type,
  inputValue,
  selectionSet,
  path,
  parameters,
  parentType,
}: {
  outputValue: any,
  type: OutputType,
  inputValue: any,
  selectionSet: SelectionSet | undefined,
  path: ResponsePath,
  parameters: Parameters,
  parentType: CompositeType,
}): {
  // The updated version of `outputValue`. Never `undefined`, but can be `null`.
  updated: any,
  // Whether the returned value is "valid" for `type`. In other words, this is true only if both `updated` is `null`
  // and `type` is non-nullable. This indicates that this is a `null` that needs to be "bubbled up".
  isInvalid?: boolean,
  // Whether errors have already been generated for the computation of the current value. This only exists for the sake
  // of recursive calls to avoid generating multiple errors as we bubble up nulls.
  hasErrors?: boolean,
} {
  assert(inputValue !== undefined, 'Should not pass undefined for `inputValue` to this method');

  if (outputValue === null || (outputValue !== undefined && !selectionSet)) {
    // If we've already computed the value for a non-composite type (scalar or enum), then we're just
    // running into a "duplicate" selection of this value but we have nothing more to do (the reason we
    // have more to do for composites is that the sub-selection may differ from the previous we've seen).
    // And if the value is null, even if the type is composite, then there is nothing more to be done (do
    // not that if there was some bubbling up of `null` to be done, it would have been done before because
    // the rulesof graphQL ensures that everything going into a given response name has same nullability
    // constraints (https://spec.graphql.org/June2018/#SameResponseShape()).
    return { updated: outputValue };
  }

  if (isNonNullType(type)) {
    const { updated, hasErrors } = updateOutputValue({
      outputValue,
      type: type.ofType,
      inputValue,
      selectionSet,
      path,
      parameters,
      parentType,
    });
    if (updated === null) {
      if (!hasErrors) {
        parameters.errors.push(ERRORS.INVALID_GRAPHQL.err(
          `Cannot return null for non-nullable ${pathLastElementDescription(path, type.ofType, parentType)}.`,
          { path: Array.from(path) }
        ));
      }
      return { updated, isInvalid: true, hasErrors: true };
    }
    return { updated };
  }

  // Note that from that point, we never have to bubble up null since the type is nullable.

  if (inputValue === null) {
    // If the input is null, so is the output, no matter what. And since we already dealt with non-nullable, then it's
    // an ok value at that point.
    return { updated: null };
  }

  if (isListType(type)) {
    // The current `outputValue` can't be `null` at that point, so it's either:
    //   1. some array: we need to recurse into each value of that array, and deal with potential
    //     null bubbling up.
    //   2. undefined: this is the first time we're computing anything for this value, so we
    //     want to recurse like in the previous case, but just with undefined as current value.
    // Anything else means the subgraph sent us something fishy.
    assert(Array.isArray(inputValue), () => `Invalid non-list value ${inputValue} returned by subgraph for list type ${type}`)
    assert(outputValue === undefined || Array.isArray(outputValue), () => `Invalid non-list value ${outputValue} returned by subgraph for list type ${type}`)
    const outputValueList: any[] = outputValue === undefined ? new Array(inputValue.length).fill(undefined) : outputValue;
    // Note that if we already had an existing output value, then it was built from the same "input" list than we have now, so it should match length.
    assert(inputValue.length === outputValueList.length, () => `[${inputValue}].length (${inputValue.length}) !== [${outputValueList}].length (${outputValueList.length})`)
    let shouldNullify = false;
    let hasErrors = false;
    const updated = outputValueList.map((outputEltValue, idx) => {
      path.push(idx);
      const elt = updateOutputValue({
        outputValue: outputEltValue,
        type: type.ofType,
        inputValue: inputValue[idx],
        selectionSet,
        path,
        parameters,
        parentType,
      });
      path.pop();
      // If the element is invalid, it means it's a null but the list inner type is non-nullable, and we should nullify the whole list.
      // We do continue iterating so we collect potential errors for other elements.
      shouldNullify ||= !!elt.isInvalid;
      hasErrors ||= !!elt.hasErrors;
      return elt.updated;
    });
    // Note that we should pass up whether an error has already be logged for the inner elements or not, but the value is otherwise not
    // invalid at this point, even if null.
    return { updated: shouldNullify ? null : updated, hasErrors }
  }

  if (isCompositeType(type)) {
    assert(selectionSet, () => `Invalid empty selection set for composite type ${type}`);
    assert(typeof inputValue === 'object', () => `Invalid non-object value ${inputValue} returned by subgraph for composite type ${type}`)
    assert(outputValue === undefined || typeof outputValue === 'object', () => `Invalid non-object value ${inputValue} returned by subgraph for composite type ${type}`)

    const inputTypename = inputValue[typenameFieldName];
    assert(inputTypename === undefined || typeof inputTypename === 'string', () => `Invalid non-string value ${inputTypename} for __typename at ${path}`)
    let objType = type;
    if (inputTypename) {
      // If we do have a typename, but the type is not in our api schema (or is not a composite for some reason), we play it safe and
      // return `null`.
      const typenameType = parameters.schema.type(inputTypename);
      if (!typenameType || !isCompositeType(typenameType)) {
        // Please note that, as `parameters.schema` is the API schema, this is were we will get if a subgraph returns an object for type that is @inacessible.
        // And as we don't want to leak inaccessible type names, we should _not_ include `inputTypename` in the error message (note that both `type` and
        // `parentType` are fine to include because both come from the query and thus API schema; but typically, `type` might be an (accessible) interface
        // while `inputTypename` is the name of an implementation that happens to not be accessible).
        parameters.errors.push(ERRORS.INVALID_GRAPHQL.err(
          `Invalid __typename found for object at ${pathLastElementDescription(path, type, parentType)}.`,
          { path: Array.from(path) }
        ));
        return { updated: null, hasErrors: true };
      }
      objType = typenameType;
    }

    const outputValueObject: Record<string, any> = outputValue === undefined ? Object.create(null) : outputValue;

    const res = applySelectionSet({
      input: inputValue,
      selectionSet,
      output: outputValueObject,
      parameters,
      path,
      parentType: objType,
    });
    // If we're bubbling up a null, then we return a null for the whole object; but we also know that a null error has
    // already been logged and don't need to anymore.
    const hasErrors = res === ApplyResult.NULL_BUBBLE_UP;
    return { updated: hasErrors ? null : outputValueObject, hasErrors };
  }

  // Note that because of the initial condition of this function, and the fact we've essentially deal with the
  // cases where `isCompositeType(baseType(type))`, we know that if we're still here, `outputValue` is undefined
  // and was remains is just to validate that the input is a valid value for the type and return that.
  assert(outputValue === undefined, () => `Excepted output to be undefined but got ${type} for type ${type}`)

  const isValidValue = isValidLeafValue(parameters.schema, inputValue, type);
  if (!isValidValue) {
    parameters.errors.push(ERRORS.INVALID_GRAPHQL.err(
      `Invalid value found for ${pathLastElementDescription(path, type, parentType)}.`,
      { path: Array.from(path) }
    ));
  }
  // Not that we're already logged an error that the value is invalid, so no point in throwing an addition null error if
  // the type ends up being null on top of that.
  return { updated: isValidValue ? inputValue : null, hasErrors: !isValidValue};
}
