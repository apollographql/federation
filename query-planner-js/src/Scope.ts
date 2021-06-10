import { DirectiveNode, GraphQLCompositeType, GraphQLObjectType, isTypeSubTypeOf, ValueNode } from "graphql";
import { QueryPlanningContext } from "./QueryPlanningContext";

/**
 * A chain of type conditions leading to a particular point within an object.
 *
 * For instance, for a query like:
 * ```
 * {
 *   v {
 *     f1
 *     ... on X {
 *       f2
 *       ... on Y @myDirective {
 *         f3
 *       }
 *     }
 *   }
 * }
 * ```
 * and assuming the type of field `v` is `V`, then the scope for `f1` would be just type `V`,
 * while the one for `f2` is the chain `X <- V` and the one for `f3` is the chain `Y <- X <- V`.
 *
 * Mainly, the scope contains enough information to 1) to compute the set of possible runtime
 * type an object can have at a given point in the query (@see `possibleRuntimeTypes`) and
 * 2) recreate minimal type conditions to obtain that set of possible runtimes.
 *
 * Additionally, the scope keep track of any directive that is applied on one of the type
 * condition it represents. So in the example below, the scope will aslo track that for
 * reaching `f3` there is a `@myDirective` directive on the `Y` condition.
 *
 * Do note that scope attempts to be "minimal" in that they eschew unecessary conditions. For
 * example, in query:
 * ```
 * {
 *   v {
 *     ... on X {
 *       ... on V {
 *         f
 *       }
 *     }
 *   }
 * }
 * ```
 * still assuming that `v` is of type `V` and assuming that X is a subtype of V, the scope for field
 * `f` will simply be `V <- X` (instead of `V <- X <- V`) as the outermost `... on V` condition adds
 * nothing (but scope always preserve the most inner type condition as for a field, this is the type
 * in which the field is defined). Additionally, if type `X` happens to a _super type_ of `V`, the
 * scope for `f` would simply be `V`.
 */
export class Scope {
  private cachedRuntimeTypes?: readonly GraphQLObjectType[];
  private cachedIdentityKey: string | undefined = undefined;

  private constructor(
    private readonly context: QueryPlanningContext,

    /** The innermost type of this scope. */
    public readonly parentType: GraphQLCompositeType,
    /** Directives associated to `parentType`. */
    public readonly directives?: readonly DirectiveNode[],
    /** Then enclosing scope, that is the next scope in the chain. */
    public readonly enclosing?: Scope
  ) {
  }

  /**
   * Creates a new scope given a top-level type.
   *
   * @param context - the query planning context in which this scope is created.
   * @param parentType - the top-level (and only) type of the created scope.
   * @returns the newly created scope.
   */
  static create(context: QueryPlanningContext, parentType: GraphQLCompositeType) {
    return new Scope(context, parentType, undefined, undefined);
  }

  /**
   * Refines this scope by (maybe) adding the provide type (with the optional provided directives).
   *
   * @param type - the new type to refine this scope with.
   * @param directives - optional directives for `type` condition.
   * @returns a scope corresponding to restrictive this scope with the `type`. This may return
   * this scope (be a no-op) if `directives` is undefined/null/empty and `type` is a super type of
   * one of the existing type in this scope. Otherwise (if either `directives` is non empty or
   * `type` genuinely restricts the existing types in this scope), a new scope with `type`
   * as first link in the scope chain.
   */
  refine(type: GraphQLCompositeType, directives?: readonly DirectiveNode[]) : Scope {
    // Always treat the absence of directives as "undefined" to make is simpler.
    if (directives && directives.length == 0) {
      directives = undefined;
    }
    // Scope always preserve the immediate parent type, but if the new type is already the parent one
    // and we have not directives to preserve, simply return the existing scope.
    if (!directives && type === this.parentType) {
      return this;
    }
    return new Scope(this.context, type, directives, Scope.pruneRefinedTypes(this, type));
  }

  private static pruneRefinedTypes(
    toPrune: Scope | undefined,
    refiningType: GraphQLCompositeType
  ) : Scope | undefined {
    if (!toPrune) {
      return undefined;
    }
    if (!toPrune.directives && isTypeSubTypeOf(toPrune.context.schema, refiningType, toPrune.parentType)) {
      // The newly added type is a subtype of the current "link", and the current link has no directives,
      // so it's not useful anymore. Skip it, and check if we can prune further.
      return Scope.pruneRefinedTypes(toPrune.enclosing, refiningType);
    }
    return new Scope(
      toPrune.context,
      toPrune.parentType,
      toPrune.directives,
      Scope.pruneRefinedTypes(toPrune.enclosing, refiningType)
    );
  }

  /**
   *  Whether this scope is restricting the possible runtime types of the provided type.
   */
  isStrictlyRefining(type: GraphQLCompositeType) : boolean {
    // This scope will refine the provided type, unless that provided type is a subtype of all
    // the type in the chain.
    let scope: Scope | undefined = this;
    while (scope) {
      if (scope.parentType !== type && isTypeSubTypeOf(this.context.schema, scope.parentType, type)) {
        return true;
      }
      scope = scope.enclosing;
    }
    return false;
  }

  private computePossibleRuntimeTypes() : readonly GraphQLObjectType[] {
    // The possible runtime types is the intersection of all the possible types of each condition in scope.
    let possibleTypes = this.context.getPossibleTypes(this.parentType);
    let nextScope = this.enclosing;
    while (nextScope) {
      let enclosingPossibleTypes = this.context.getPossibleTypes(nextScope.parentType);
      possibleTypes = possibleTypes.filter(t => enclosingPossibleTypes.includes(t));
      nextScope = nextScope.enclosing;
    }
    return possibleTypes;
  }

  /**
   * Computes the set of object types that an object within this scope can have at runtime.
   */
  possibleRuntimeTypes() : readonly GraphQLObjectType[] {
    if (!this.cachedRuntimeTypes) {
      this.cachedRuntimeTypes = this.computePossibleRuntimeTypes();
    }
    return this.cachedRuntimeTypes;
  }

  private static valueIdentityKey(value: ValueNode) : string {
    // We distinguish different value types though a leading character with a single quote (so the int 3 has key "i'3") to
    // avoid conflicts.
    switch (value.kind) {
      case 'Variable':
        return value.name.value;
      case 'IntValue':
        return "i'" + value.value;
      case 'FloatValue':
        return "f'" + value.value;
      case 'EnumValue':
        return "e'" + value.value;
      case 'StringValue':
        // Using stringfy to enclose in double quotes (so that we don't have issues with, say, strings within
        // lists) _and_ getting proper escape of double quotes within the string.
        return `s'${JSON.stringify(value.value)}`;
      case 'BooleanValue':
        return "b'" + String(value.value);
      case 'NullValue':
        return "<null>";
      case 'ListValue':
        return "[" + value.values.map(this.valueIdentityKey).join('-') + "]";
      case 'ObjectValue':
        const fields = value.fields.map(f => f.name.value + '-' + this.valueIdentityKey(f.value));
        fields.sort(); // Field order is not semantically significant in graphQL.
        return "{" + fields.join('-') + "}";
    }
  }

  private static directiveIdentityKey(directive: DirectiveNode) : string {
    const argsKeys = directive.arguments
      ? directive.arguments.map(arg => arg.name.value + '-' + Scope.valueIdentityKey(arg.value))
      : [];
    argsKeys.sort(); // Argument order is not semantically significant in graphQL.
    return `${directive.name.value}-${argsKeys.join('-')}`;
  }

  private static directivesIdentityKey(directives: readonly DirectiveNode[]) : string {
    const keys = directives.map(d => Scope.directiveIdentityKey(d));
    // We sort the directives keys as we don't want the order application of directives to matter
    // in the equality. In other words, we want:
    //   ... on X @foo @bar
    // to be the same as:
    //   ... on X @bar @foo
    keys.sort();
    return keys.join('-');
  }

  private computeIdentityKey(): string {
      const directivesKey = this.directives ? Scope.directivesIdentityKey(this.directives) : "";
      const enclosingKey = this.enclosing ? this.enclosing.computeIdentityKey() : "";
      return `${this.parentType}-${directivesKey}-${enclosingKey}`;
  }

  /**
   * A string value that uniquely identify the scope.
   *
   * The "identity key" of 2 scope objects can be tested for equality to decide if 2 scopes are equal. This exists
   * so that scopes can be (kind of) used as map keys: javacript maps always only use reference equality for objects
   * when used as key, so using this string allows to effectively get value equality.
   *
   * Note that the main property this method must ensure is that if 2 scopes have the same `identityKey()`, then they
   * are semantically equivalent (their treatment by the query planner is undistiguishable). If 2 scopes are
   * semantically equivalent, they should generally have a the same `identityKey()` but this is less important (a
   * case breaking this would only lead to slightly less efficient query plans than necessary) and we haven't spent
   * tremendous times ensuring this was absolutely always the case.
   *
   * @returns a string uniquely identifying this scope.
   */
  public identityKey() : string {
    if (!this.cachedIdentityKey) {
      this.cachedIdentityKey = this.computeIdentityKey();
    }
    return this.cachedIdentityKey;
  }

  /**
   * Provides a string representation of this scope suitable for debugging.
   *
   * The format looks like '<A @x @y <B>>' where 'A' is the scope 'parentType', '<B>' is the 'enclosing' scope
   * and '@x @y' the potential directives.
   *
   * @return a string representation of the scope.
   */
  debugPrint() : string {
    let enclosingStr = '';
    if (this.enclosing) {
      enclosingStr = ' ' + this.enclosing.debugPrint();
    }
    let directiveStr = '';
    if (this.directives) {
      directiveStr = this.directives.map(d => ' @' + d.name.value).join(' ');
    }
    return`<${this.parentType}${directiveStr}${enclosingStr}>`;
  }
}
