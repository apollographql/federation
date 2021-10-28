import { GraphQLError } from "graphql";
import { addSubgraphToError, ERRORS, extendsDirectiveName, Extension, firstOf, keyDirectiveName, NamedType, printSubgraphNames, shareableDirectiveName, Subgraphs } from ".";
import {
  baseType,
  CompositeType,
  Directive,
  DirectiveDefinition,
  errorCauses,
  FieldDefinition,
  InterfaceType,
  isCompositeType,
  isInterfaceType,
  isObjectType,
  ObjectType,
  Schema,
  SchemaElement,
  sourceASTs
} from "./definitions";
import {
  federationBuiltIns,
  parseFieldSetArgument,
  removeInactiveProvidesAndRequires,
  setSchemaAsFed2Subgraph,
  Subgraph,
} from "./federation";
import { MultiMap } from "./utils";

export type UpgradeResult = UpgradeSuccess | UpgradeFailure;

type UpgradeChanges = MultiMap<UpgradeChangeID, UpgradeChange>;

export type UpgradeSuccess = {
  upgraded: Subgraphs,
  changes: Map<string, UpgradeChanges>,
  errors?: never, 
}

export type UpgradeFailure = {
  upgraded?: never,
  changes?: never,
  errors: GraphQLError[],
}

export type UpgradeChangeID = UpgradeChange['id'];

export type UpgradeChange =
  ExternalOnTypeExtensionRemoval
  | TypeExtensionRemoval
  | UnusedExternalRemoval
  | InactiveProvidesOrRequiresRemoval
  | InactiveProvidesOrRequiresFieldsRemoval
  | ShareableFieldAddition
  | ShareableTypeAddition
;

export class ExternalOnTypeExtensionRemoval {
  readonly id = 'EXTERNAL_ON_TYPE_EXTENSION_REMOVAL' as const;

  constructor(readonly field: string) {}

  toString() {
    return `Removed @external from field "${this.field}" as it is a key of an extension type`;
  }
}

export class TypeExtensionRemoval {
  readonly id = 'TYPE_EXTENSION_REMOVAL' as const;

  constructor(readonly type: string) {}

  toString() {
    return `Switched type "${this.type}" from an extension to a defintion`;
  }
}

export class UnusedExternalRemoval {
  readonly id = 'UNUSED_EXTERNAL_REMOVAL' as const;

  constructor(readonly field: string) {}

  toString() {
    return `Removed @external field "${this.field}" as it was not used in any @key, @provides or @requires`;
  }
}

export class InactiveProvidesOrRequiresRemoval {
  readonly id = 'INACTIVE_PROVIDES_OR_REQUIRES_REMOVAL' as const;

  constructor(readonly parent: string, readonly removed: string) {}

  toString() {
    return `Removed directive ${this.removed} on "${this.parent}": none of the fields were truly @external`;
  }
}

export class InactiveProvidesOrRequiresFieldsRemoval {
  readonly id = 'INACTIVE_PROVIDES_OR_REQUIRES_FIELDS_REMOVAL' as const;

  constructor(readonly parent: string, readonly original: string, readonly updated: string) {}

  toString() {
    return `Updated directive ${this.original} on "${this.parent}" to ${this.updated}: removed fields that were not truly @external`;
  }
}

export class ShareableFieldAddition {
  readonly id = 'SHAREABLE_FIELD_ADDITION' as const;

  constructor(readonly field: string, readonly declaringSubgraphs: string[]) {}

  toString() {
    return `Added @shareable to field ${this.field}: it is also resolved by ${printSubgraphNames(this.declaringSubgraphs)}`;
  }
}

export class ShareableTypeAddition {
  readonly id = 'SHAREABLE_TYPE_ADDITION' as const;

  constructor(readonly type: string, readonly declaringSubgraphs: string[]) {}

  toString() {
    return `Added @shareable to type ${this.type}: it is a "value type" and is also declared in ${printSubgraphNames(this.declaringSubgraphs)}`;
  }
}

export function upgradeSubgraphsIfNecessary(subgraphs: Subgraphs): UpgradeResult {
  const changes: Map<string, UpgradeChanges> = new Map();
  if (subgraphs.values().every((s) => s.isFed2Subgraph())) {
    return { upgraded: subgraphs, changes };
  }

  const upgraded = new Subgraphs();
  let errors: GraphQLError[] = [];
  for (const subgraph of subgraphs.values()) {
    if (subgraph.isFed2Subgraph()) {
      upgraded.add(subgraph);
    } else {
      const otherSubgraphs = subgraphs.values().filter((s) => s.name !== subgraph.name);
      const res = new SchemaUpgrader(subgraph, otherSubgraphs).upgrade();
      if (res.errors) {
        errors = errors.concat(res.errors);
      } else {
        upgraded.add(res.upgraded);
        changes.set(subgraph.name, res.changes);
      }
    }
  }
  return errors.length === 0 ? { upgraded, changes } : { errors };
}

/**
 * Wether the type represents a type extension in the sense of federation 1.
 * That is, type extension are a thing in GraphQL, but federation 1 overloads the notion for entities. This method
 * return true if the type is used in the federation 1 sense of an extension.
 * And we recognize federation 1 type extensions as type extension that:
 *  1. are on object type or interface type (note that federation 1 don't really handle interface type extension properly but it "accepts" them
 *     so we do it here too).
 *  2. have a @key.
 *  3. do not have a definition for the same type in the same subgraph (this is a GraphQL extension otherwise).
 */
function isFederationTypeExtension(type: NamedType): boolean {
  // Note that we have to handle @extend as well.
  const hasExtend = type.hasAppliedDirective(extendsDirectiveName);
  return (type.hasExtensionElements() || hasExtend)
    && (isObjectType(type) || isInterfaceType(type))
    && type.hasAppliedDirective(keyDirectiveName)
    && (hasExtend || !type.hasNonExtensionElements());
}

/**
 * Whether the type is a root type but is declared has (only) an extension, which federation 1 actually accepts.
 */
function isRootTypeExtension(type: NamedType): boolean {
  return isObjectType(type)
    && type.isRootType()
    && (type.hasAppliedDirective(extendsDirectiveName) || (type.hasExtensionElements() && !type.hasNonExtensionElements()));
}

function resolvesField(subgraph: Subgraph, field: FieldDefinition<ObjectType>): boolean  {
  const metadata = subgraph.metadata();
  const t = subgraph.schema.type(field.parent.name);
  if (!t || !isObjectType(t)) {
    return false;
  }
  const f = t.field(field.name);
  return !!f && (!metadata.isFieldExternal(f) || metadata.isFieldPartiallyExternal(f));
}

class SchemaUpgrader {
  private readonly changes = new MultiMap<UpgradeChangeID, UpgradeChange>();
  private readonly usedExternalFieldsCoordinates = new Set<string>();
  private readonly schema: Schema;
  private readonly subgraph: Subgraph;

  constructor(private readonly originalSubgraph: Subgraph, private readonly otherSubgraphs: Subgraph[]) {
    // Note that as we clone the original schema, the 'sourceAST' values in the elements of the new schema will be those of the original schema
    // and those won't be updated as we modify the schema to make it fed2-enabled. This is _important_ for us here as this is what ensures that
    // later merge errors "AST" nodes ends up pointing to the original schema, the one that make sense to the user.
    this.schema = originalSubgraph.schema.clone();
    setSchemaAsFed2Subgraph(this.schema);
    this.subgraph = new Subgraph(originalSubgraph.name, originalSubgraph.url, this.schema);
  }

  private keys(type: ObjectType): Directive<ObjectType, { fields: any }>[] {
    return type.appliedDirectivesOf(federationBuiltIns.keyDirective(this.schema));
  }

  private external(elt: FieldDefinition<any>): Directive<any, {}> | undefined {
    const applications = elt.appliedDirectivesOf(federationBuiltIns.externalDirective(this.schema));
    return applications.length === 0 ? undefined : applications[0];
  }

  private addChange(change: UpgradeChange) {
    this.changes.add(change.id, change);
  }

  private checkForExtensionWithNoBase(type: NamedType): GraphQLError[] {
    // The checks that if the type is a "federation 1" type extension, then another subgraph has a proper definition
    // for that type.
    if (!isFederationTypeExtension(type)) {
      return [];
    }

    const extensionAST = firstOf<Extension<any>>(type.extensions().values())?.sourceAST;
    for (const subgraph of this.otherSubgraphs) {
      const otherType = subgraph.schema.type(type.name);
      if (otherType && otherType.hasNonExtensionElements()) {
        return [];
      }
    }

    // We look at all the other subgraphs and didn't found a (non-extension) definition of that type
    return [ERRORS.EXTENSION_WITH_NO_BASE.err({
      message: `Type "${type}" is an extension type, but there is no type definition for "${type}" in any subgraph.`,
      nodes: extensionAST,
    })];
  }

  // TODO: This essentially imply fed 1 schema cannot have a user-defined @shareable directive. Hopefully no current user does,
  // but if someone reports a problem, we'll have to find a solution.
  private checkForShareableUses(type: NamedType): GraphQLError[] {
    if (!isObjectType(type)) {
      return [];
    }

    const errors: GraphQLError[] = [];
    if (type.hasAppliedDirective(shareableDirectiveName)) {
      errors.push(ERRORS.INVALID_GRAPHQL.err({
        message: `Directive @${shareableDirectiveName} is only available in federation 2+ schema`,
        nodes: sourceASTs(...type.appliedDirectivesOf(shareableDirectiveName)),
      }));
    }
    for (const field of type.fields()) {
      if (field.hasAppliedDirective(shareableDirectiveName)) {
        errors.push(ERRORS.INVALID_GRAPHQL.err({
          message: `Directive @${shareableDirectiveName} is only available in federation 2+ schema`,
          nodes: sourceASTs(...field.appliedDirectivesOf(shareableDirectiveName)),
        }));
      }
    }

    return errors;
  }

  private preUpgradeValidations(): GraphQLError[] {
    let errors: GraphQLError[] = [];
    for (const type of this.schema.types()) {
      errors = errors.concat(this.checkForExtensionWithNoBase(type));
      errors = errors.concat(this.checkForShareableUses(type));
    }
    return errors;
  }

  upgrade(): { upgraded: Subgraph, changes: UpgradeChanges, errors?: never } | { errors: GraphQLError[] } {
    const errors = this.preUpgradeValidations();
    if (errors.length > 0) {
      return { errors: errors.map((e) => addSubgraphToError(e, this.subgraph.name, ERRORS.INVALID_GRAPHQL)) };
    }

    // Note that we remove all external on type extensions first, so we don't have to care about it later in @key, @provides and @requires.
    this.removeExternalOnTypeExtensions();

    removeInactiveProvidesAndRequires(
      this.schema,
      (field, original, updated) => {
        if (updated) {
          this.addChange(new InactiveProvidesOrRequiresFieldsRemoval(field.coordinate, original.toString(), updated.toString()));
        } else {
          this.addChange(new InactiveProvidesOrRequiresRemoval(field.coordinate, original.toString()));
        }
      }
    );

    this.removeTypeExtensions();

    this.removeUnusedExternals();

    this.addShareable();

    try {
      this.subgraph.validate();
      return {
        upgraded: this.subgraph,
        changes: this.changes,
      };
    } catch (e) {
      const errors = errorCauses(e);
      if (!errors) {
        throw e;
      }
      return { errors };
    }
  }

  private applyOnFieldsOfFieldSet(
    parentType: CompositeType,
    directive: Directive<any, {fields: any}>,
    onField: (field: FieldDefinition<any>) => void
  ) {
    // When we do this, we're unsure the `fields` argument is valid, and so this may throw. We want
    // to silence such errors at this point however: proper errors will be thrown post-upgrade when
    // the schema is fully validated.
    try {
      parseFieldSetArgument(parentType, directive, (parentType, fieldName) => {
        const field = parentType.field(fieldName);
        if (field) {
          onField(field);
        }
        return field;
      });
    } catch (e) {
      // This essentially checks if the error is a GraphQLError one. If it isn't, we rethrow as this may be a
      // programming error in this file and we don't want to silence that.
      if (errorCauses(e) === undefined) {
        throw e;
      }
      // If it _is_ an expected validation error however, we ignore it.
    }
  }

  private removeExternalOnTypeExtensions() {
    for (const type of this.schema.types<ObjectType>('ObjectType')) {
      for (const keyApplication of this.keys(type)) {
        if (keyApplication.ofExtension()) {
          this.applyOnFieldsOfFieldSet(type, keyApplication, field => {
            const external = this.external(field);
            if (external) {
              this.addChange(new ExternalOnTypeExtensionRemoval(field.coordinate));
              external.remove();
            }
          });
        }
      }
    }
  }

  private removeTypeExtensions() {
    for (const type of this.schema.types()) {
      if (!isFederationTypeExtension(type) && !isRootTypeExtension(type)) {
        continue;
      }

      this.addChange(new TypeExtensionRemoval(type.coordinate));
      type.removeExtensions();
    }
  }

  private removeUnusedExternals() {
    this.collectAllUsedExternaFields();

    for (const type of this.schema.types()) {
      if (!isObjectType(type) && !isInterfaceType(type)) {
        continue;
      }
      for (const field of type.fields()) {
        if (this.external(field) !== undefined && !this.usedExternalFieldsCoordinates.has(field.coordinate)) {
          this.addChange(new UnusedExternalRemoval(field.coordinate));
          field.remove();
        }
      }
    }
  }

  private collectAllUsedExternaFields() {
    // Collects all external fields used by a key, requires or provides
    this.collectUsedExternaFields<CompositeType>(
      federationBuiltIns.keyDirective(this.schema),
      type => type
    );
    this.collectUsedExternaFields<FieldDefinition<CompositeType>>(
      federationBuiltIns.requiresDirective(this.schema),
      field => field.parent!,
    );
    this.collectUsedExternaFields<FieldDefinition<CompositeType>>(
      federationBuiltIns.providesDirective(this.schema),
      field => {
        const type = baseType(field.type!);
        return isCompositeType(type) ? type : undefined;
      },
    );

    // Collects all external fields used to satisfy an interface constraint
    for (const itfType of this.schema.types<InterfaceType>('InterfaceType')) {
      const runtimeTypes = itfType.possibleRuntimeTypes();
      for (const field of itfType.fields()) {
        for (const runtimeType of runtimeTypes) {
          const implemField = runtimeType.field(field.name);
          if (implemField && this.external(implemField) !== undefined) {
            this.usedExternalFieldsCoordinates.add(implemField.coordinate);
          }
        }
      }
    }
  }

  private collectUsedExternaFields<TParent extends SchemaElement<any, any>>(
    definition: DirectiveDefinition<{fields: any}>,
    targetTypeExtractor: (element: TParent) => CompositeType | undefined,
  ) {
    for (const application of definition.applications()) {
      const type = targetTypeExtractor(application.parent! as TParent);
      if (!type) {
        // Means the application is wrong: we ignore it here as later validation will detect it
        continue;
      }
      this.applyOnFieldsOfFieldSet(type, application as Directive<any, {fields: any}>, field => {
        if (this.external(field) !== undefined) {
          this.usedExternalFieldsCoordinates.add(field.coordinate);
        }
      });
    }
  }

  private addShareable() {
    const originalMetadata = this.originalSubgraph.metadata();
    const keyDirective = federationBuiltIns.keyDirective(this.schema);
    const shareableDirective = federationBuiltIns.shareableDirective(this.schema);
    // We add shareable:
    // - to every "value type" (in the fed1 sense of non-root type and non-entity) if it is used in any other subgraphs
    // - to any (non-external) field of an entity/root-type that is not a key field and if another subgraphs resolve it (fully or partially through @provides)
    for (const type of this.schema.types<ObjectType>('ObjectType')) {
      if (type.hasAppliedDirective(keyDirective) || type.isRootType()) {
        for (const field of type.fields()) {
          // To know if the field is a "key" field which doesn't need shareable, we rely on whether the field is shareable in the original
          // schema (the fed1 version), because as fed1 schema will have no @shareable, the key fields will effectively be the only field
          // considered shareable.
          if (originalMetadata.isFieldShareable(field)) {
            continue;
          }
          const otherResolvingSubgraphs = this.otherSubgraphs.filter((s) => resolvesField(s, field));
          if (otherResolvingSubgraphs.length > 0) {
            field.applyDirective(shareableDirective);
            this.addChange(new ShareableFieldAddition(field.coordinate, otherResolvingSubgraphs.map((s) => s.name)));
          }
        }
      } else {
        const otherDeclaringSubgraphs = this.otherSubgraphs.filter((s) => s.schema.type(type.name));
        if (otherDeclaringSubgraphs.length > 0) {
          type.applyDirective(shareableDirective);
          this.addChange(new ShareableTypeAddition(type.coordinate, otherDeclaringSubgraphs.map((s) => s.name)));
        }
      }
    }
  }
}
