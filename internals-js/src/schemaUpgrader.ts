import {
    ASTNode,
  GraphQLError,
  Kind,
  print as printAST,
} from "graphql";
import { ERRORS } from "./error";
import {
  baseType,
  Directive,
  errorCauses,
  Extension,
  FieldDefinition,
  InterfaceType,
  isCompositeType,
  isInterfaceType,
  isObjectType,
  NamedSchemaElement,
  NamedType,
  ObjectType,
  Schema,
  SchemaElement,
} from "./definitions";
import {
  addSubgraphToError,
  federationMetadata,
  FederationMetadata,
  printSubgraphNames,
  removeInactiveProvidesAndRequires,
  setSchemaAsFed2Subgraph,
  Subgraph,
  Subgraphs,
} from "./federation";
import { assert, firstOf, MultiMap } from "./utils";
import { FEDERATION_SPEC_TYPES } from "./federationSpec";
import { collectUsedExternalFieldsCoordinates, collectTargetFields } from ".";

export type UpgradeResult = UpgradeSuccess | UpgradeFailure;

type UpgradeChanges = MultiMap<UpgradeChangeID, UpgradeChange>;

export type UpgradeSuccess = {
  subgraphs: Subgraphs,
  changes: Map<string, UpgradeChanges>,
  errors?: never, 
}

export type UpgradeFailure = {
  subgraphs?: never,
  changes?: never,
  errors: GraphQLError[],
}

export type UpgradeChangeID = UpgradeChange['id'];

export type UpgradeChange =
  ExternalOnTypeExtensionRemoval
  | TypeExtensionRemoval
  | UnusedExternalRemoval
  | ExternalOnInterfaceRemoval
  | InactiveProvidesOrRequiresRemoval
  | InactiveProvidesOrRequiresFieldsRemoval
  | ShareableFieldAddition
  | ShareableTypeAddition
  | KeyOnInterfaceRemoval
  | ProvidesOrRequiresOnInterfaceFieldRemoval
  | ProvidesOnNonCompositeRemoval
  | FieldsArgumentCoercionToString
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
    return `Switched type "${this.type}" from an extension to a definition`;
  }
}

export class ExternalOnInterfaceRemoval {
  readonly id = 'EXTERNAL_ON_INTERFACE_REMOVAL' as const;

  constructor(readonly field: string) {}

  toString() {
    return `Removed @external directive on interface type field "${this.field}": @external is nonsensical on interface fields`;
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
    return `Added @shareable to field "${this.field}": it is also resolved by ${printSubgraphNames(this.declaringSubgraphs)}`;
  }
}

export class ShareableTypeAddition {
  readonly id = 'SHAREABLE_TYPE_ADDITION' as const;

  constructor(readonly type: string, readonly declaringSubgraphs: string[]) {}

  toString() {
    return `Added @shareable to type "${this.type}": it is a "value type" and is also declared in ${printSubgraphNames(this.declaringSubgraphs)}`;
  }
}

export class KeyOnInterfaceRemoval {
  readonly id = 'KEY_ON_INTERFACE_REMOVAL' as const;

  constructor(readonly type: string) {}

  toString() {
    return `Removed @key on interface "${this.type}": while allowed by federation 0.x, @key on interfaces were completely ignored/had no effect`;
  }
}

export class ProvidesOrRequiresOnInterfaceFieldRemoval {
  readonly id = 'PROVIDES_OR_REQUIRES_ON_INTERFACE_FIELD_REMOVAL' as const;

  constructor(readonly field: string, readonly directive: string) {}

  toString() {
    return `Removed @${this.directive} on interface field "${this.field}": while allowed by federation 0.x, @${this.directive} on interface fields were completely ignored/had no effect`;
  }
}

export class ProvidesOnNonCompositeRemoval {
  readonly id = 'PROVIDES_ON_NON_COMPOSITE_REMOVAL' as const;

  constructor(readonly field: string, readonly type: string) {}

  toString() {
    return `Removed @provides directive on field "${this.field}" as it is of non-composite type "${this.type}": while not rejected by federation 0.x, such @provide is nonsensical and was ignored`;
  }
}

export class FieldsArgumentCoercionToString {
  readonly id = 'FIELDS_ARGUMENT_COERCION_TO_STRING' as const;

  constructor(readonly element: string, readonly directive: string, readonly before: string, readonly after: string) {}

  toString() {
    return `Coerced "fields" argument for directive @${this.directive} for "${this.element}" into a string: coerced from ${this.before} to ${this.after}`;
  }
}

export function upgradeSubgraphsIfNecessary(inputs: Subgraphs): UpgradeResult {
  const changes: Map<string, UpgradeChanges> = new Map();
  if (inputs.values().every((s) => s.isFed2Subgraph())) {
    return { subgraphs: inputs, changes };
  }

  const subgraphs = new Subgraphs();
  let errors: GraphQLError[] = [];
  for (const subgraph of inputs.values()) {
    if (subgraph.isFed2Subgraph()) {
      subgraphs.add(subgraph);
    } else {
      const otherSubgraphs = inputs.values().filter((s) => s.name !== subgraph.name);
      const res = new SchemaUpgrader(subgraph, otherSubgraphs).upgrade();
      if (res.errors) {
        errors = errors.concat(res.errors);
      } else {
        subgraphs.add(res.upgraded);
        changes.set(subgraph.name, res.changes);
      }
    }
  }
  return errors.length === 0 ? { subgraphs, changes } : { errors };
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
  const metadata = federationMetadata(type.schema());
  assert(metadata, 'Should be a subgraph schema');
  const hasExtend = type.hasAppliedDirective(metadata.extendsDirective());
  return (type.hasExtensionElements() || hasExtend)
    && (isObjectType(type) || isInterfaceType(type))
    && type.hasAppliedDirective(metadata.keyDirective())
    && (hasExtend || !type.hasNonExtensionElements());
}

/**
 * Whether the type is a root type but is declared has (only) an extension, which federation 1 actually accepts.
 */
function isRootTypeExtension(type: NamedType): boolean {
  const metadata = federationMetadata(type.schema());
  assert(metadata, 'Should be a subgraph schema');
  return isObjectType(type)
    && type.isRootType()
    && (type.hasAppliedDirective(metadata.extendsDirective()) || (type.hasExtensionElements() && !type.hasNonExtensionElements()));
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
  private readonly schema: Schema;
  private readonly subgraph: Subgraph;
  private readonly metadata: FederationMetadata;

  constructor(private readonly originalSubgraph: Subgraph, private readonly otherSubgraphs: Subgraph[]) {
    // Note that as we clone the original schema, the 'sourceAST' values in the elements of the new schema will be those of the original schema
    // and those won't be updated as we modify the schema to make it fed2-enabled. This is _important_ for us here as this is what ensures that
    // later merge errors "AST" nodes ends up pointing to the original schema, the one that make sense to the user.
    this.schema = originalSubgraph.schema.clone();
    this.renameFederationTypes();
    setSchemaAsFed2Subgraph(this.schema);
    this.subgraph = new Subgraph(originalSubgraph.name, originalSubgraph.url, this.schema);
    this.metadata = this.subgraph.metadata();
  }

  private renameFederationTypes() {
    // When we set the upgraded schema as a fed2 schema, we only "import" the federation directives, but not the federation types. This
    // means that those types will be called `_Entity`, `_Any`, ... in the fed1 original schema, but they should be called `federation__Entity`,
    // `federation__Any`, ... in the new upgraded schema.
    // But note that even "importing" those types would not completely work because fed2 essentially drops the `_` at the beginning of those
    // type names (relying on the core schema prefixing instead) and so some special translation needs to happen.
    for (const typeSpec of FEDERATION_SPEC_TYPES) {
      const typeNameInOriginal = this.originalSubgraph.metadata().federationTypeNameInSchema(typeSpec.name);
      const type = this.schema.type(typeNameInOriginal);
      if (type) {
        type.rename(`federation__${typeSpec.name}`);
      }
    }
  }

  private external(elt: FieldDefinition<any>): Directive<any, {}> | undefined {
    const applications = elt.appliedDirectivesOf(this.metadata.externalDirective());
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

  private preUpgradeValidations(): GraphQLError[] {
    let errors: GraphQLError[] = [];
    for (const type of this.schema.types()) {
      errors = errors.concat(this.checkForExtensionWithNoBase(type));
    }
    return errors;
  }

  upgrade(): { upgraded: Subgraph, changes: UpgradeChanges, errors?: never } | { errors: GraphQLError[] } {
    const errors = this.preUpgradeValidations();
    if (errors.length > 0) {
      return { errors: errors.map((e) => addSubgraphToError(e, this.subgraph.name, ERRORS.INVALID_GRAPHQL)) };
    }

    this.fixFederationDirectivesArguments();

    this.removeExternalOnInterface();

    // Note that we remove all external on type extensions first, so we don't have to care about it later in @key, @provides and @requires.
    this.removeExternalOnTypeExtensions();

    this.fixInactiveProvidesAndRequires();

    this.removeTypeExtensions();

    this.removeDirectivesOnInterface();

    // Note that this rule rely on being after `removeDirectivesOnInterface` in practice (in that it doesn't check interfaces).
    this.removeProvidesOnNonComposite();

    // Note that this should come _after_ all the other changes that may remove/update federation directives, since those may create unused
    // externals. Which is why this is toward  the end.
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

  private fixFederationDirectivesArguments() {
    for (const directive of [this.metadata.keyDirective(), this.metadata.requiresDirective(), this.metadata.providesDirective()]) {
      for (const application of directive.applications()) {
        const fields = application.arguments().fields;
        if (typeof fields !== 'string') {
          // The one case we have seen in practice is user passing an array of string, so we handle that. If it's something else,
          // it's probably just completely invalid, so we ignore the application and let validation complain later.
          if (Array.isArray(fields) && fields.every((f) => typeof f === 'string')) {
            this.replaceFederationDirectiveApplication(application, application.toString(), fields.join(' '), directive.sourceAST);
          }
          continue;
        }

        // While validating if the field is a string will work in most cases, this will not catch the case where the field argument was
        // unquoted but parsed as an enum value (see federation/issues/850 in particular). So if we have the AST (which we will usually
        // have in practice), use that to check that the argument was truly a string.
        const nodes = application.sourceAST;
        if (nodes && nodes.kind === 'Directive') {
          for (const argNode of nodes.arguments ?? []) {
            if (argNode.name.value === 'fields') {
              if (argNode.value.kind === Kind.ENUM) {
                // Note that we we mostly want here is replacing the sourceAST because that is what is later used by validation
                // to detect the problem.
                this.replaceFederationDirectiveApplication(application, printAST(nodes), fields, {
                  ...nodes,
                  arguments: [{
                    ...argNode,
                    value: {
                      kind: Kind.STRING,
                      value: fields
                    }
                  }]
                })
                break;
              }
            }
          }
        }
      }
    }
  }

  private removeExternalOnInterface() {
    for (const itf of this.schema.types<InterfaceType>('InterfaceType')) {
      for (const field of itf.fields()) {
        const external = this.external(field);
        if (external) {
          this.addChange(new ExternalOnInterfaceRemoval(field.coordinate));
          external.remove();
        }
      }
    }
  }

  private replaceFederationDirectiveApplication(
    application: Directive<SchemaElement<any, any>, {fields: any}>,
    before: string,
    fields: string,
    updatedSourceAST: ASTNode | undefined,
  ) {
    const directive = application.definition!;
    // Note that in practice, federation directives can only be on either a type or a field, both of which are named.
    const parent = application.parent as NamedSchemaElement<any, any, any>;
    application.remove();
    const newDirective = parent.applyDirective(directive, {fields});
    newDirective.sourceAST = updatedSourceAST;
    this.addChange(new FieldsArgumentCoercionToString(parent.coordinate, directive.name, before, newDirective.toString()));
  }

  private fixInactiveProvidesAndRequires() {
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
  }

  private removeExternalOnTypeExtensions() {
    for (const type of this.schema.types()) {
      if (!isCompositeType(type)) {
        continue;
      }
      if (!isFederationTypeExtension(type) && !isRootTypeExtension(type)) {
        continue;
      }
      for (const keyApplication of type.appliedDirectivesOf(this.metadata.keyDirective())) {
        collectTargetFields({
          parentType: type,
          directive: keyApplication,
          includeInterfaceFieldsImplementations: false,
          validate: false,
        }).forEach((field) => {
          const external = this.external(field);
          if (external) {
            this.addChange(new ExternalOnTypeExtensionRemoval(field.coordinate));
            external.remove();
          }
        });
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
    const usedExternalFieldsCoordinates = collectUsedExternalFieldsCoordinates(this.metadata);

    for (const type of this.schema.types()) {
      if (!isObjectType(type) && !isInterfaceType(type)) {
        continue;
      }
      for (const field of type.fields()) {
        if (this.metadata.isFieldExternal(field) && !usedExternalFieldsCoordinates.has(field.coordinate)) {
          this.addChange(new UnusedExternalRemoval(field.coordinate));
          field.remove();
        }
      }
    }
  }

  private removeDirectivesOnInterface() {
    for (const type of this.schema.types<InterfaceType>('InterfaceType')) {
      for (const application of type.appliedDirectivesOf(this.metadata.keyDirective())) {
        this.addChange(new KeyOnInterfaceRemoval(type.name));
        application.remove();
      }
      for (const field of type.fields()) {
        for (const directive of [this.metadata.providesDirective(), this.metadata.requiresDirective()]) {
          for (const application of field.appliedDirectivesOf(directive)) {
            this.addChange(new ProvidesOrRequiresOnInterfaceFieldRemoval(field.coordinate, directive.name));
            application.remove();
          }
        }
      }
    }
  }

  private removeProvidesOnNonComposite() {
    for (const type of this.schema.types<ObjectType>('ObjectType')) {
      for (const field of type.fields()) {
        if (isCompositeType(baseType(field.type!))) {
          continue;
        }
        for (const application of field.appliedDirectivesOf(this.metadata.providesDirective())) {
          this.addChange(new ProvidesOnNonCompositeRemoval(field.coordinate, field.type!.toString()));
          application.remove();
        }
      }
    }
  }

  private addShareable() {
    const originalMetadata = this.originalSubgraph.metadata();
    const keyDirective = this.metadata.keyDirective();
    const shareableDirective = this.metadata.shareableDirective();
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
