import {
    ASTNode,
  GraphQLError,
  Kind,
  print as printAST,
} from "graphql";
import { errorCauses, ERRORS } from "./error";
import {
  baseType,
  CompositeType,
  Directive,
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
  collectTargetFields,
  federationMetadata,
  FederationMetadata,
  printSubgraphNames,
  removeInactiveProvidesAndRequires,
  setSchemaAsFed2Subgraph,
  Subgraph,
  Subgraphs,
} from "./federation";
import { assert, firstOf, MultiMap } from "./utils";
import { valueEquals } from "./values";
import { FEDERATION1_TYPES } from "./specs/federationSpec";

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
  | TypeWithOnlyUnusedExternalRemoval
  | ExternalOnInterfaceRemoval
  | ExternalOnObjectTypeRemoval
  | InactiveProvidesOrRequiresRemoval
  | InactiveProvidesOrRequiresFieldsRemoval
  | ShareableFieldAddition
  | ShareableTypeAddition
  | KeyOnInterfaceRemoval
  | ProvidesOrRequiresOnInterfaceFieldRemoval
  | ProvidesOnNonCompositeRemoval
  | FieldsArgumentCoercionToString
  | RemovedTagOnExternal
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

export class ExternalOnObjectTypeRemoval {
  readonly id = 'EXTERNAL_ON_OBJECT_TYPE_REMOVAL' as const;

  constructor(readonly type: string) {}

  toString() {
    return `Removed @external directive on object type "${this.type}": @external on types was not rejected but was inactive in fed1`;
  }
}

export class UnusedExternalRemoval {
  readonly id = 'UNUSED_EXTERNAL_REMOVAL' as const;

  constructor(readonly field: string) {}

  toString() {
    return `Removed @external field "${this.field}" as it was not used in any @key, @provides or @requires`;
  }
}

export class TypeWithOnlyUnusedExternalRemoval {
  readonly id = 'TYPE_WITH_ONLY_UNUSED_EXTERNAL_REMOVAL' as const;

  constructor(readonly type: string) {}

  toString() {
    return `Removed type ${this.type} that is not referenced in the schema and only declares unused @external fields`;
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

export class RemovedTagOnExternal {
  readonly id = 'REMOVED_TAG_ON_EXTERNAL' as const;

  constructor(readonly application: string, readonly element: string) {}

  toString() {
    return `Removed ${this.application} application on @external "${this.element}" as the @tag application is on another definition`;
  }
}

export function upgradeSubgraphsIfNecessary(inputs: Subgraphs): UpgradeResult {
  const changes: Map<string, UpgradeChanges> = new Map();
  if (inputs.values().every((s) => s.isFed2Subgraph())) {
    return { subgraphs: inputs, changes };
  }

  const subgraphs = new Subgraphs();
  let errors: GraphQLError[] = [];
  const subgraphsUsingInterfaceObject = [];
  
  // build a data structure to help us do computation only once
  const objectTypeMap = new Map<string, Map<string, [ObjectType | InterfaceType, FederationMetadata]>>();
  for (const subgraph of inputs.values()) {
    for (const t of subgraph.schema.objectTypes()) {
      let entry = objectTypeMap.get(t.name);
      if (!entry) {
        entry = new Map();
        objectTypeMap.set(t.name, entry);
      }
      entry.set(subgraph.name, [t, subgraph.metadata()]);
    }
    for (const t of subgraph.schema.interfaceTypes()) {
      let entry = objectTypeMap.get(t.name);
      if (!entry) {
        entry = new Map();
        objectTypeMap.set(t.name, entry);
      }
      entry.set(subgraph.name, [t, subgraph.metadata()]);
    }
  }
  
  for (const subgraph of inputs.values()) {
    if (subgraph.isFed2Subgraph()) {
      subgraphs.add(subgraph);
      if (subgraph.metadata().interfaceObjectDirective().applications().size > 0) {
        subgraphsUsingInterfaceObject.push(subgraph.name);
      }
    } else {
      const res = new SchemaUpgrader(subgraph, inputs.values(), objectTypeMap).upgrade();
      if (res.errors) {
        errors = errors.concat(res.errors);
      } else {
        subgraphs.add(res.upgraded);
        changes.set(subgraph.name, res.changes);
      }
    }
  }
  if (errors.length === 0 && subgraphsUsingInterfaceObject.length > 0) {
    const fed1Subgraphs = inputs.values().filter((s) => !s.isFed2Subgraph()).map((s) => s.name);
    // Note that we exit this method early if everything is a fed2 schema, so we know at least one of them wasn't.
    errors = [ ERRORS.INTERFACE_OBJECT_USAGE_ERROR.err(
      'The @interfaceObject directive can only be used if all subgraphs have federation 2 subgraph schema (schema with a `@link` to "https://specs.apollo.dev/federation" version 2.0 or newer): '
      + `@interfaceObject is used in ${printSubgraphNames(subgraphsUsingInterfaceObject)} but ${printSubgraphNames(fed1Subgraphs)} ${fed1Subgraphs.length > 1 ? 'are not' : 'is not a'} federation 2 subgraph schema.`,
    )];
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
 *  2. do not have a definition for the same type in the same subgraph (this is a GraphQL extension otherwise).
 *
 * Not that type extensions in federation 1 generally have a @key but in really the code consider something a type extension even without
 * it (which I'd argue is a unintended bug of fed1 since this leads to various problems) so we don't check for the presence of @key here.
 */
function isFederationTypeExtension(type: NamedType): boolean {
  const metadata = federationMetadata(type.schema());
  assert(metadata, 'Should be a subgraph schema');
  const hasExtend = type.hasAppliedDirective(metadata.extendsDirective());
  return (type.hasExtensionElements() || hasExtend)
    && (isObjectType(type) || isInterfaceType(type))
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

function getField(schema: Schema, typeName: string, fieldName: string): FieldDefinition<CompositeType> | undefined {
  const type = schema.type(typeName);
  return type && isCompositeType(type) ? type.field(fieldName) : undefined;
}

class SchemaUpgrader {
  private readonly changes = new MultiMap<UpgradeChangeID, UpgradeChange>();
  private readonly schema: Schema;
  private readonly subgraph: Subgraph;
  private readonly metadata: FederationMetadata;
  private readonly errors: GraphQLError[] = [];

  constructor(private readonly originalSubgraph: Subgraph, private readonly allSubgraphs: readonly Subgraph[], private readonly objectTypeMap: Map<string, Map<string, [ObjectType | InterfaceType, FederationMetadata]>>) {
    // Note that as we clone the original schema, the 'sourceAST' values in the elements of the new schema will be those of the original schema
    // and those won't be updated as we modify the schema to make it fed2-enabled. This is _important_ for us here as this is what ensures that
    // later merge errors "AST" nodes ends up pointing to the original schema, the one that make sense to the user.
    this.schema = originalSubgraph.schema.clone();
    this.renameFederationTypes();
    // Setting this property before trying to switch the cloned schema to fed2 because on
    // errors `addError` uses `this.subgraph.name`.
    this.subgraph = new Subgraph(originalSubgraph.name, originalSubgraph.url, this.schema);
    try {
      setSchemaAsFed2Subgraph(this.schema);
    } catch (e) {
      // This could error out if some directive definition clashes with a federation one while
      // having an incompatible definition. Note that in that case, the choices for the user
      // are either:
      // 1. fix/remove the definition if they did meant the federation directive, just had an
      //   invalid definition.
      // 2. but if they have their own directive whose name happens to clash with a federation
      //   directive one but is genuinely a different directive, they will have to move their
      //   schema to a fed2 one and use renaming.
      const causes = errorCauses(e);
      if (causes) {
        causes.forEach((c) => this.addError(c));
      } else {
        // An unexpected exception, rethrow.
        throw e;
      }
    }
    this.metadata = this.subgraph.metadata();
  }

  private addError(e: GraphQLError): void {
    this.errors.push(addSubgraphToError(e, this.subgraph.name, ERRORS.INVALID_GRAPHQL));
  }

  private renameFederationTypes() {
    // When we set the upgraded schema as a fed2 schema, we only "import" the federation directives, but not the federation types. This
    // means that those types will be called `_Entity`, `_Any`, ... in the fed1 original schema, but they should be called `federation__Entity`,
    // `federation__Any`, ... in the new upgraded schema.
    // But note that even "importing" those types would not completely work because fed2 essentially drops the `_` at the beginning of those
    // type names (relying on the core schema prefixing instead) and so some special translation needs to happen.
    for (const typeSpec of FEDERATION1_TYPES) {
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

  private checkForExtensionWithNoBase(type: NamedType): void {
    // The checks that if the type is a "federation 1" type extension, then another subgraph has a proper definition
    // for that type.
    if (isRootTypeExtension(type) || !isFederationTypeExtension(type)) {
      return;
    }

    const extensionAST = firstOf<Extension<any>>(type.extensions().values())?.sourceAST;
    const typeInOtherSubgraphs = Array.from(this.objectTypeMap.get(type.name)!.entries()).filter(([subgraphName, _]) => subgraphName !== this.subgraph.name);
    for (let i = 0; i < typeInOtherSubgraphs.length; i += 1) {
      const otherType = typeInOtherSubgraphs[i][1][0];
      if (otherType && otherType.hasNonExtensionElements()) {
        return;
      }
    }

    // We look at all the other subgraphs and didn't found a (non-extension) definition of that type
    this.addError(ERRORS.EXTENSION_WITH_NO_BASE.err(
      `Type "${type}" is an extension type, but there is no type definition for "${type}" in any subgraph.`,
      { nodes: extensionAST },
    ));
  }

  private preUpgradeValidations(): void {
    for (const type of this.schema.types()) {
     this.checkForExtensionWithNoBase(type);
    }
  }

  upgrade(): { upgraded: Subgraph, changes: UpgradeChanges, errors?: never } | { errors: GraphQLError[] } {
    this.preUpgradeValidations();

    this.fixFederationDirectivesArguments();

    this.removeExternalOnInterface();
    this.removeExternalOnObjectTypes();

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

    this.removeTagOnExternal();

    // If we had errors during the upgrade, we throw them before trying to validate the resulting subgraph, because any invalidity in the
    // migrated subgraph may well due to those migration errors and confuse users.
    if (this.errors.length > 0) {
      return { errors: this.errors };
    }

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
      // Do note that it's genuinely possible to return errors here, because federation validations (validating @key, @provides, ...) is mostly
      // not done on the input schema and will only be triggered now, on the upgraded schema. Importantly, the errors returned here shouldn't
      // be due to the upgrade process, but either due to the fed1 schema being invalid in the first place, or due to validation of fed2 that
      // cannot be dealt with by the upgrade process (like, for instance, the fact that fed1 doesn't always reject fields mentioned in a @key
      // that are not defined in the subgraph, but fed2 consistently do).
      return { errors };
    }
  }

  private fixFederationDirectivesArguments() {
    for (const directive of [this.metadata.keyDirective(), this.metadata.requiresDirective(), this.metadata.providesDirective()]) {
      // Note that we may remove (to replace) some of the application we iterate on, so we need to copy the list we iterate on first.
      for (const application of Array.from(directive.applications())) {
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
    for (const itf of this.schema.interfaceTypes()) {
      for (const field of itf.fields()) {
        const external = this.external(field);
        if (external) {
          this.addChange(new ExternalOnInterfaceRemoval(field.coordinate));
          external.remove();
        }
      }
    }
  }

  private removeExternalOnObjectTypes() {
    for (const type of this.schema.objectTypes()) {
      const external = type.appliedDirectivesOf(this.metadata.externalDirective())[0];
      if (external) {
        this.addChange(new ExternalOnObjectTypeRemoval(type.coordinate));
        external.remove();
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

      const keyApplications = type.appliedDirectivesOf(this.metadata.keyDirective());
      if (keyApplications.length > 0) {
        // If the type extension has keys, then fed1 will essentially consider the key fields not external ...
        for (const keyApplication of type.appliedDirectivesOf(this.metadata.keyDirective())) {
          collectTargetFields({
            parentType: type,
            directive: keyApplication,
            includeInterfaceFieldsImplementations: false,
            validate: false,
          }).forEach((field) => {
            // We only consider "top-level" fields, the one of the type on which the key is, because that's what fed1 does.
            if (field.parent !== type) {
              return;
            }
            const external = this.external(field);
            if (external) {
              this.addChange(new ExternalOnTypeExtensionRemoval(field.coordinate));
              external.remove();
            }
          });
        }
      } else {
        // ... but if the extension does _not_ have a key, then if the extension has a field that is
        // part of the _1st_ key on the subgraph owning the type, then this field is not considered
        // external (yes, it's pretty damn random, and it's even worst in that even if the extension
        // does _not_ have the "field of the _1st_ key on the subraph owning the type", then the
        // query planner will still request it to the subgraph, generating an invalid query; but
        // we ignore that here). Note however that because other subgraphs may have already been
        // upgraded, we don't know which is the "type owner", so instead we look up at the first
        // key of every other subgraph. It's not 100% what fed1 does, but we're in very-strange
        // case territory in the first place, so this is probably good enough (that is, there is
        // customer schema for which what we do here matter but not that I know of for which it's
        // not good enough).
        const typeInOtherSubgraphs = Array.from(this.objectTypeMap.get(type.name)!.entries()).filter(([subgraphName, _]) => subgraphName !== this.subgraph.name);
        
        for (const [otherSubgraphName, v] of typeInOtherSubgraphs) {
          const [typeInOther, metadata] = v;
          assert(isCompositeType(typeInOther), () => `Type ${type} is of kind ${type.kind} in ${this.subgraph.name} but ${typeInOther.kind} in ${otherSubgraphName}`);
          const keysInOther = typeInOther.appliedDirectivesOf(metadata.keyDirective());
          if (keysInOther.length === 0) {
            continue;
          }
          collectTargetFields({
            parentType: typeInOther,
            directive: keysInOther[0],
            includeInterfaceFieldsImplementations: false,
            validate: false,
          }).forEach((field) => {
            if (field.parent !== typeInOther) {
              return;
            }
            // Remark that we're iterating on the fields of _another_ subgraph that the one we're upgrading.
            // We only consider "top-level" fields, the one of the type on which the key is, because that's what fed1 does.
            const ownField = type.field(field.name);
            if (!ownField) {
              return;
            }
            const external = this.external(ownField);
            if (external) {
              this.addChange(new ExternalOnTypeExtensionRemoval(ownField.coordinate));
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
    for (const type of this.schema.types()) {
      if (!isObjectType(type) && !isInterfaceType(type)) {
        continue;
      }
      for (const field of type.fields()) {
        if (this.metadata.isFieldExternal(field) && !this.metadata.isFieldUsed(field)) {
          this.addChange(new UnusedExternalRemoval(field.coordinate));
          field.remove();
        }
      }
      if (!type.hasFields()) {
        if (type.isReferenced()) {
          this.addError(ERRORS.TYPE_WITH_ONLY_UNUSED_EXTERNAL.err(
            `Type ${type} contains only external fields and all those fields are all unused (they do not appear in any @key, @provides or @requires).`,
            { nodes: type.sourceAST },
          ));
        } else {
          // The type only had unused externals, but it is also unreferenced in the subgraph. Unclear why
          // it was there in the first place, but we can remove it and move on.
          this.addChange(new TypeWithOnlyUnusedExternalRemoval(type.name));
          type.remove();
        }
      }
    }
  }

  private removeDirectivesOnInterface() {
    for (const type of this.schema.interfaceTypes()) {
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
    for (const type of this.schema.objectTypes()) {
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
    for (const type of this.schema.objectTypes()) {
      if(type.isSubscriptionRootType()) {
        continue;
      }
      if (type.hasAppliedDirective(keyDirective) || (type.isRootType())) {
        for (const field of type.fields()) {
          // To know if the field is a "key" field which doesn't need shareable, we rely on whether the field is shareable in the original
          // schema (the fed1 version), because as fed1 schema will have no @shareable, the key fields will effectively be the only field
          // considered shareable.
          if (originalMetadata.isFieldShareable(field)) {
            continue;
          }
          
          const entries = Array.from(this.objectTypeMap.get(type.name)!.entries());
          const typeInOtherSubgraphs = entries.filter(([subgraphName, v]) => {
            if (subgraphName === this.subgraph.name) {
              return false;
            }
            const f = v[0].field(field.name);
            return !!f && (!v[1].isFieldExternal(f) || v[1].isFieldPartiallyExternal(f));
          });
          
          if (typeInOtherSubgraphs.length > 0 && !field.hasAppliedDirective(shareableDirective)) {
            field.applyDirective(shareableDirective);
            this.addChange(new ShareableFieldAddition(field.coordinate, typeInOtherSubgraphs.map(([s]) => s)));
          }
        }
      } else {
        const typeInOtherSubgraphs = Array.from(this.objectTypeMap.get(type.name)!.entries()).filter(([subgraphName, _]) => subgraphName !== this.subgraph.name);
        if (typeInOtherSubgraphs.length > 0 && !type.hasAppliedDirective(shareableDirective)) {
          type.applyDirective(shareableDirective);
          this.addChange(new ShareableTypeAddition(type.coordinate, typeInOtherSubgraphs.map(([s]) => s)));
        }
      }
    }
  }

  private removeTagOnExternal() {
    const tagDirective = this.schema.directive('tag');
    if (!tagDirective) {
      return;
    }

    // Copying the list we iterate on as we remove in the loop.
    for (const application of Array.from(tagDirective.applications())) {
      const element = application.parent;
      if (!(element instanceof FieldDefinition)) {
        continue;
      }
      if (this.external(element)) {
        const tagIsUsedInOtherDefinition = this.allSubgraphs
          .map((s) => s.name === this.originalSubgraph.name ? undefined : getField(s.schema, element.parent.name, element.name))
          .filter((f) => !(f && f.hasAppliedDirective('external')))
          .some((f) => f && f.appliedDirectivesOf('tag').some((d) => valueEquals(application.arguments(), d.arguments())));

        if (tagIsUsedInOtherDefinition) {
          this.addChange(new RemovedTagOnExternal(application.toString(), element.coordinate));
          application.remove();
        }
      }
    }
  }
}
