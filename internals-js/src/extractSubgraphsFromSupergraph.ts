import {
  baseType,
  CompositeType,
  Directive,
  FieldDefinition,
  InputFieldDefinition,
  InputObjectType,
  InterfaceType,
  isEnumType,
  isInterfaceType,
  isObjectType,
  isUnionType,
  ListType,
  NamedType,
  newNamedType,
  NonNullType,
  NullableType,
  ObjectType,
  Schema,
  Type,
} from "./definitions";
import {
  addSubgraphToError,
  externalDirectiveName,
  federationBuiltIns,
  parseFieldSetArgument,
  removeInactiveProvidesAndRequires
} from "./federation";
import { CoreSpecDefinition, FeatureVersion } from "./coreSpec";
import { JoinSpecDefinition } from "./joinSpec";
import { Subgraph, Subgraphs } from "./federation";
import { assert } from "./utils";
import { validateSupergraph } from "./supergraphs";
import { builtTypeReference } from "./buildSchema";
import { GraphQLError } from "graphql";
import { isSubtype } from "./types";
import { printSchema } from "./print";
import fs from 'fs';
import path from 'path';
import { validateStringContainsBoolean } from "./utils";

function filteredTypes(
  supergraph: Schema,
  joinSpec: JoinSpecDefinition,
  coreSpec: CoreSpecDefinition
): NamedType[] {
  // Note: we skip coreSpec to avoid having core__Purpose since we don't create core schema subgraph.
  // But once we support core schema subgraphs and start shipping federation core features, we may need
  // to revisit this.
  return supergraph.types().filter(t => !joinSpec.isSpecType(t) && !coreSpec.isSpecType(t));
}

export function extractSubgraphsNamesAndUrlsFromSupergraph(supergraph: Schema): {name: string, url: string}[] {
  const [_, joinSpec] = validateSupergraph(supergraph);
  const [subgraphs] = collectEmptySubgraphs(supergraph, joinSpec);
  return subgraphs.values().map(subgraph => {return { name: subgraph.name, url: subgraph.url }});
}

function collectEmptySubgraphs(supergraph: Schema, joinSpec: JoinSpecDefinition): [Subgraphs, Map<string, string>] {
  const subgraphs = new Subgraphs();
  const graphDirective = joinSpec.graphDirective(supergraph);
  const graphEnum = joinSpec.graphEnum(supergraph);
  const graphEnumNameToSubgraphName = new Map<string, string>();
  for (const value of graphEnum.values) {
    const graphApplications = value.appliedDirectivesOf(graphDirective);
    if (!graphApplications.length) {
      throw new Error(`Value ${value} of join__Graph enum has no @join__graph directive`);
    }
    const info = graphApplications[0].arguments();
    const subgraph = new Subgraph(info.name, info.url, new Schema(federationBuiltIns));
    subgraphs.add(subgraph);
    graphEnumNameToSubgraphName.set(value.name, info.name);
  }
  return [subgraphs, graphEnumNameToSubgraphName];
}

export function extractSubgraphsFromSupergraph(supergraph: Schema): Subgraphs {
  const [coreFeatures, joinSpec] = validateSupergraph(supergraph);
  const isFed1 = joinSpec.version.equals(new FeatureVersion(0, 1));

  // We first collect the subgraphs (creating an empty schema that we'll populate next for each).
  const [subgraphs, graphEnumNameToSubgraphName] = collectEmptySubgraphs(supergraph, joinSpec);
  const typeDirective = joinSpec.typeDirective(supergraph);
  const implementsDirective = joinSpec.implementsDirective(supergraph);

  // Next, we iterate on all types and add it to the proper subgraphs (along with any @key).
  // Note that we first add all types empty and populate the types next. This avoids having to care about the iteration
  // order if we have fields than depends on other types.
  for (const type of filteredTypes(supergraph, joinSpec, coreFeatures.coreDefinition)) {
    const typeApplications = type.appliedDirectivesOf(typeDirective);
    if (!typeApplications.length) {
      // Imply the type is in all subgraphs (technically, some subgraphs may not have had this type, but adding it
      // in that case is harmless because it will be unreachable anyway).
      subgraphs.values().map(sg => sg.schema).forEach(schema => schema.addType(newNamedType(type.kind, type.name)));
    } else {
      for (const application of typeApplications) {
        const args = application.arguments();
        const subgraphName = graphEnumNameToSubgraphName.get(args.graph)!;
        const schema = subgraphs.get(subgraphName)!.schema;
        // We can have more than one type directive for a given subgraph
        let subgraphType = schema.type(type.name);
        if (!subgraphType) {
          subgraphType = schema.addType(newNamedType(type.kind, type.name));
        }
        if (args.key) {
          const directive = subgraphType.applyDirective('key', {'fields': args.key});
          if (args.extension) {
            directive.setOfExtension(subgraphType.newExtension());
          }
        }
      }
    }
  }

  const ownerDirective = joinSpec.ownerDirective(supergraph);
  const fieldDirective = joinSpec.fieldDirective(supergraph);
  // We can now populate all those types (with relevant @provides and @requires on fields).
  for (const type of filteredTypes(supergraph, joinSpec, coreFeatures.coreDefinition)) {
    switch (type.kind) {
      case 'ObjectType':
      // @ts-expect-error: we fall-through the inputObjectType for fields.
      case 'InterfaceType':
        const addedInterfaces = [];
        const implementsApplications = implementsDirective ? type.appliedDirectivesOf(implementsDirective) : [];
        for (const application of implementsApplications) {
          const args = application.arguments();
          const subgraph = subgraphs.get(graphEnumNameToSubgraphName.get(args.graph)!)!;
          const schema = subgraph.schema;
          (schema.type(type.name)! as (ObjectType | InterfaceType)).addImplementedInterface(args.interface);
          addedInterfaces.push(args.interface);
        }
        for (const implementations of type.interfaceImplementations()) {
          // If the object/interface implements an interface but we had no @join__implements for it (which will
          // always be the case for join v0.1 in particular), then that means the object/interface should implement
          // the interface in all subgraphs (which contains both types).
          const name = implementations.interface.name;
          if (!addedInterfaces.includes(name)) {
            for (const subgraph of subgraphs) {
              const subgraphType = subgraph.schema.type(type.name);
              const subgraphItf = subgraph.schema.type(name);
              if (subgraphType && subgraphItf) {
                (subgraphType as (ObjectType | InterfaceType)).addImplementedInterface(name);
              }
            }
          }
        }
        // Fall-through on purpose.
      case 'InputObjectType':
        for (const field of type.fields()) {
          const fieldApplications = field.appliedDirectivesOf(fieldDirective);
          if (!fieldApplications.length) {
            // The meaning of having no join__field depends on whether the parent type has a join__owner.
            // If it does, it means the field is only on that owner subgraph. Otherwise, we kind of don't
            // know, so we add it to all subgraphs that have the parent type and, if the field base type
            // is a named type, know that field type.
            const ownerApplications = ownerDirective ? type.appliedDirectivesOf(ownerDirective) : [];
            if (!ownerApplications.length) {
              const fieldBaseType = baseType(field.type!);
              for (const subgraph of subgraphs) {
                if (subgraph.schema.type(fieldBaseType.name)) {
                  addSubgraphField(field, subgraph);
                }
              }
            } else {
              assert(ownerApplications.length == 1, () => `Found multiple join__owner directives on type ${type}`)
              const subgraph = subgraphs.get(graphEnumNameToSubgraphName.get(ownerApplications[0].arguments().graph)!)!;
              const subgraphField = addSubgraphField(field, subgraph);
              assert(subgraphField, () => `Found join__owner directive on ${type} but no corresponding join__type`);
            }
          } else {
            for (const application of fieldApplications) {
              const args = application.arguments();
              const subgraph = subgraphs.get(graphEnumNameToSubgraphName.get(args.graph)!)!;
              const subgraphField = addSubgraphField(field, subgraph, args.type);
              assert(subgraphField, () => `Found join__field directive for graph ${subgraph.name} on field ${field.coordinate} but no corresponding join__type on ${type}`);
              if (args.requires) {
                subgraphField.applyDirective('requires', {'fields': args.requires});
              }
              if (args.provides) {
                subgraphField.applyDirective('provides', {'fields': args.provides});
              }
              if (args.external) {
                subgraphField.applyDirective('external');
              }
            }
          }
        }
        break;
      case 'EnumType':
        // TODO: it's not guaranteed that every enum value was in every subgraph declaring the enum and we should preserve
        // that info with the join spec. But for now, we add every values to all subgraphs (having the enum)
        for (const subgraph of subgraphs) {
          const subgraphEnum = subgraph.schema.type(type.name);
          if (!subgraphEnum) {
            continue;
          }
          assert(isEnumType(subgraphEnum), () => `${subgraphEnum} should be an enum but found a ${subgraphEnum.kind}`);
          for (const value of type.values) {
            subgraphEnum.addValue(value.name);
          }
        }
        break;
      case 'UnionType':
        // TODO: Same as for enums. We need to know in which subgraph each member is defined.
        // But for now, we also add every members to all subgraphs (as long as the subgraph has both the union type
        // and the member in question).
        for (const subgraph of subgraphs) {
          const subgraphUnion = subgraph.schema.type(type.name);
          if (!subgraphUnion) {
            continue;
          }
          assert(isUnionType(subgraphUnion), () => `${subgraphUnion} should be an enum but found a ${subgraphUnion.kind}`);
          for (const memberType of type.types()) {
            const subgraphType = subgraph.schema.type(memberType.name);
            if (subgraphType) {
              subgraphUnion.addType(subgraphType as ObjectType);
            }
          }
        }
        break;
    }
  }

  for (const subgraph of subgraphs) {
    if (isFed1) {
      // The join spec in fed1 was not including external fields. Let's make sure we had them or we'll get validation
      // errors later.
      addExternalFields(subgraph, supergraph, isFed1);
    }
    removeInactiveProvidesAndRequires(subgraph.schema);

    // We now do an additional path on all types because we sometimes added types to subgraphs without
    // being sure that the subgraph had the type in the first place (especially with the 0.1 join spec), and because
    // we later might not have added any fields/members to said type, they may be empty (indicating they clearly
    // didn't belong to the subgraph in the first) and we need to remove them.
    // Note that need to do this _after_ the `addExternalFields` call above since it may have added (external) fields
    // to some of the types.
    for (const type of subgraph.schema.types()) {
      switch (type.kind) {
        case 'ObjectType':
        case 'InterfaceType':
        case 'InputObjectType':
          if (!type.hasFields()) {
            // Note that we have to use removeRecursive or this could leave the subgraph invalid. But if the
            // type was not in this subgraphs, nothing that depends on it should be either.
            type.removeRecursive();
          }
          break;
        case 'UnionType':
          if (type.membersCount() === 0) {
            type.removeRecursive();
          }
          break;
      }
    }
  }

  // TODO: Not sure that code is needed anymore (any field necessary to validate an interface will have been marked
  // external)?
  if (isFed1) {
    // We now make a pass on every field of every interface and check that all implementers do have that field (even if
    // external). If not (which can happen because, again, the v0.1 spec had no information on where an interface was
    // truly defined, so we've so far added them everywhere with all their fields, but some fields may have been part
    // of an extension and be only in a few subgraphs), we remove the field or the subgraph would be invalid.
    for (const subgraph of subgraphs) {
      for (const itf of subgraph.schema.types<InterfaceType>('InterfaceType')) {
        // We only look at objects because interfaces are handled by this own loop in practice.
        const implementations = itf.possibleRuntimeTypes();
        for (const field of itf.fields()) {
          if (!implementations.every(implem => implem.field(field.name))) {
            field.remove();
          }
        }
        // And it may be that the interface wasn't part of the subgraph at all!
        if (!itf.hasFields()) {
          itf.remove();
        }
      }
    }
  }

  // We're done with the subgraphs, so call validate (which, amongst other things, sets up the _entities query field, which ensures
  // all entities in all subgraphs are reachable from a query and so are properly included in the "query graph" later).
  for (const subgraph of subgraphs) {
    try {
      subgraph.schema.validate();
    } catch (e) {
      // There is 2 reasons this could happen:
      // 1. if the subgraph is a Fed1 one, because fed2 has stricter validation than fed1, this could be due to the supergraph having been generated by fed1 and
      //    containing something invalid that fed1 accepted and fed2 didn't (for instance, an invalid `@provides` selection).
      // 2. otherwise, this would be a bug (because fed1 compatibility excluded, we shouldn't extract invalid subgraphs from valid supergraphs).
      // We throw essentially the same thing in both cases, but adapt the message slightly.
      if (isFed1) {
        // Note that this could be a bug with the code handling fed1 as well, but it's more helpful to ask users to recompose their subgraphs with fed2 as either
        // it'll solve the issue and that's good, or we'll hit the other message anyway.
        const msg = `Error extracting subgraph ${subgraph.name} from the supergraph: this might due to errors in subgraphs that were mistakenly ignored by federation 0.x versions but are rejected by federation 2.\n`
          + 'Please try composing your subgraphs with federation 2: this should help precisely pinpoint the errors and generate a correct federation 2 supergraph.';
        throw new Error(`${msg}.\n\nDetails:\n${errorToString(e, subgraph.name)}`);
      } else {
        const msg = `Unexpected error extracting subgraph ${subgraph.name} from the supergraph: this is either a bug, or the supergraph has been corrupted.`;
        const dumpMsg = maybeDumpSubgraphSchema(subgraph);
        throw new Error(`${msg}.\n\nDetails:\n${errorToString(e, subgraph.name)}\n\n${dumpMsg}`);
      }
    }
  }

  return subgraphs;
}

const DEBUG_SUBGRAPHS_ENV_VARIABLE_NAME = 'APOLLO_FEDERATION_DEBUG_SUBGRAPHS';

function maybeDumpSubgraphSchema(subgraph: Subgraph): string {
  const shouldDump = !!validateStringContainsBoolean(process.env[DEBUG_SUBGRAPHS_ENV_VARIABLE_NAME]);
  if (!shouldDump) {
    return `Re-run with environment variable '${DEBUG_SUBGRAPHS_ENV_VARIABLE_NAME}' set to 'true' to extract the invalid subgraph`;
  }
  try {
    const filename = `extracted-subgraph-${subgraph.name}-${Date.now()}.graphql`;
    const file = path.resolve(filename);
    if (fs.existsSync(file)) {
      // Note that this is caught directly by the surrounded catch.
      throw new Error(`candidate file ${filename} already existed`);
    }
    fs.writeFileSync(file, printSchema(subgraph.schema));
    return `The (invalid) extracted subgraph has been written in: ${file}.`;
  }
  catch (e2) {
    return `Was not able to print generated subgraph because: ${errorToString(e2, subgraph.name)}`;
  }
}

function errorToString(e: any, subgraphName: string): string {
  return e instanceof GraphQLError ? addSubgraphToError(e, subgraphName).toString() : String(e);
}

type AnyField = FieldDefinition<ObjectType | InterfaceType> | InputFieldDefinition;

function addSubgraphField(supergraphField: AnyField, subgraph: Subgraph, encodedType?: string): AnyField | undefined {
  if (supergraphField instanceof FieldDefinition) {
    return addSubgraphObjectOrInterfaceField(supergraphField, subgraph, encodedType);
  } else {
    return addSubgraphInputField(supergraphField, subgraph, encodedType);
  }
}

function addSubgraphObjectOrInterfaceField(
  supergraphField: FieldDefinition<ObjectType | InterfaceType>,
  subgraph: Subgraph,
  encodedType?: string
): FieldDefinition<ObjectType | InterfaceType> | undefined {
  const subgraphType = subgraph.schema.type(supergraphField.parent.name);
  if (subgraphType) {
    const copiedType = encodedType
      ? decodeType(encodedType, subgraph.schema, subgraph.name)
      : copyType(supergraphField.type!, subgraph.schema, subgraph.name);
    const field = (subgraphType as ObjectType | InterfaceType).addField(supergraphField.name, copiedType);
    for (const arg of supergraphField.arguments()) {
      field.addArgument(arg.name, copyType(arg.type!, subgraph.schema, subgraph.name), arg.defaultValue);
    }
    return field;
  } else {
    return undefined;
  }
}

function addSubgraphInputField(
  supergraphField: InputFieldDefinition,
  subgraph: Subgraph,
  encodedType?: string
): InputFieldDefinition | undefined {
  const subgraphType = subgraph.schema.type(supergraphField.parent.name);
  if (subgraphType) {
    const copiedType = encodedType
      ? decodeType(encodedType, subgraph.schema, subgraph.name)
      : copyType(supergraphField.type!, subgraph.schema, subgraph.name);
    return (subgraphType as InputObjectType).addField(supergraphField.name, copiedType);
  } else {
    return undefined;
  }
}

function decodeType(encodedType: string, subgraph: Schema, subgraphName: string): Type {
  try {
    return builtTypeReference(encodedType, subgraph);
  } catch (e) {
    assert(false, () => `Cannot parse type "${encodedType}" in subgraph ${subgraphName}: ${e}`);
  }
}

function copyType(type: Type, subgraph: Schema, subgraphName: string): Type {
  switch (type.kind) {
    case 'ListType':
      return new ListType(copyType(type.ofType, subgraph, subgraphName));
    case 'NonNullType':
      return new NonNullType(copyType(type.ofType, subgraph, subgraphName) as NullableType);
    default:
      const subgraphType = subgraph.type(type.name);
      assert(subgraphType, () => `Cannot find type ${type.name} in subgraph ${subgraphName}`);
      return subgraphType!;
  }
}

function addExternalFields(subgraph: Subgraph, supergraph: Schema, isFed1: boolean) {
  for (const type of subgraph.schema.types()) {
    if (!isObjectType(type) && !isInterfaceType(type)) {
      continue;
    }

    // First, handle @key
    for (const keyApplication of type.appliedDirectivesOf(federationBuiltIns.keyDirective(subgraph.schema))) {
      // Historically, the federation code for keys, when applied _to a type extension_:
      //  1) required @external on any field of the key
      //  2) but required the subgraph to resolve any field of that key
      // despite the combination of those being arguably illogical (@external is supposed to signify the field is _not_ resolve
      // by the subgraph).
      // To maintain backward compatibility, we have to preserve that behavior. The way this is done is that during merging,
      // if a key is on an extension, we remember it in the corresponding @join__type. And when reading @join__type directive
      // in `extractSubgraphsFromSupergraph`, we mark the generated key directive as applied to an extension (note that only
      // the key directive is marked that way, not the rest of the type; this is because we actually don't know if the rest
      // what part of an extension or not and we prefer not presuming). So, now, if we look at the fields in a key and
      // that key was on an extension, we know that we should not mark it @external, because it _is_ resolved by the subgraph.
      // If the key is on a type definition however, then we don't have that historical legacy, and so if the field is
      // not part of the subgraph, then it means that it is truly external (and composition validation will ensure that this
      // is fine).
      // Note that this is called `forceNonExternal` because an extension key field might well be part of a @provides somewhere
      // else (it's not useful to do so, kind of imply an incomprehension and we'll remove those in `removeNeedlessProvides`,
      // but it's not forbidden and has been seen) which has already added the field as @external, and we want to _remove_ the
      // @external in that case. Also note that for fed 1 supergraphs, the 'ofExtension' information is not available so we
      // have to default of forcing non-external on all key fields. Which is ok because "true" external on key fields was not
      // supported anyway.
      const forceNonExternal = isFed1 || !!keyApplication.ofExtension();
      addExternalFieldsFromDirectiveFieldSet(subgraph, type, keyApplication, supergraph, forceNonExternal);
    }
    // Then any @requires or @provides on fields
    for (const field of type.fields()) {
      for (const requiresApplication of field.appliedDirectivesOf(federationBuiltIns.requiresDirective(subgraph.schema))) {
        addExternalFieldsFromDirectiveFieldSet(subgraph, type, requiresApplication, supergraph);
      }
      const fieldBaseType = baseType(field.type!);
      for (const providesApplication of field.appliedDirectivesOf(federationBuiltIns.providesDirective(subgraph.schema))) {
        assert(isObjectType(fieldBaseType) || isInterfaceType(fieldBaseType), () => `Found @provides on field ${field.coordinate} whose type ${field.type!} (${fieldBaseType.kind}) is not an object or interface `);
        addExternalFieldsFromDirectiveFieldSet(subgraph, fieldBaseType, providesApplication, supergraph);
      }
    }

    // And then any constraint due to implemented interfaces.
    addExternalFieldsFromInterface(type);
  }
}

function addExternalFieldsFromDirectiveFieldSet(
  subgraph: Subgraph,
  parentType: ObjectType | InterfaceType,
  directive: Directive<NamedType | FieldDefinition<CompositeType>, {fields: any}>,
  supergraph: Schema,
  forceNonExternal: boolean = false,
) {
  const external = federationBuiltIns.externalDirective(subgraph.schema);

  const accessor = function (type: CompositeType, fieldName: string): FieldDefinition<any> {
    const field = type.field(fieldName);
    if (field) {
      if (forceNonExternal && field.hasAppliedDirective(external)) {
        field.appliedDirectivesOf(external).forEach(d => d.remove());
      }
      return field;
    }
    assert(!isUnionType(type), () => `Shouldn't select field ${fieldName} from union type ${type}`);

    // If the field has not been added, it is external and needs to be added as such
    const supergraphType = supergraph.type(type.name) as ObjectType | InterfaceType;
    const supergraphField = supergraphType.field(fieldName);
    assert(supergraphField, () => `No field named ${fieldName} found on type ${type.name} in the supergraph`);
    // We're know the parent type of the field exists in the subgraph (it's `type`), so we're guaranteed a field is created.
    const created = addSubgraphObjectOrInterfaceField(supergraphField, subgraph)!;
    if (!forceNonExternal) {
      created.applyDirective(external);
    }
    return created;
  };
  parseFieldSetArgument(parentType, directive, accessor);
}

function addExternalFieldsFromInterface(type: ObjectType | InterfaceType) {
  for (const itf of type.interfaces()) {
    for (const field of itf.fields()) {
      const typeField = type.field(field.name);
      if (!typeField) {
        copyFieldAsExternal(field, type);
      } else if (typeField.hasAppliedDirective(externalDirectiveName)) {
        // A subtlety here is that a type may implements multiple interfaces providing a given field, and the field may
        // not have the exact same definition in all interface. So if we may have added the field in a previous loop
        // iteration, we need to check if we shouldn't update the field type.
        maybeUpdateFieldForInterface(typeField, field);
      }
    }
  }
}

function copyFieldAsExternal(field: FieldDefinition<InterfaceType>, type: ObjectType | InterfaceType) {
  const newField = type.addField(field.name, field.type);
  for (const arg of field.arguments()) {
    newField.addArgument(arg.name, arg.type, arg.defaultValue);
  }
  newField.applyDirective(externalDirectiveName);
}

function maybeUpdateFieldForInterface(toModify: FieldDefinition<ObjectType | InterfaceType>, itfField: FieldDefinition<InterfaceType>) {
  // Note that we only care about the field type because while graphql does not allow contravariance of args for field implementations.
  // And while fed2 allow it when merging, this code doesn't run for fed2 generated supergraph, so this isn't a concern.
  if (!isSubtype(itfField.type!, toModify.type!)) {
    assert(isSubtype(toModify.type!, itfField.type!), () => `For ${toModify.coordinate}, expected ${itfField.type} and ${toModify.type} to be in a subtyping relationship`);
    toModify.type = itfField.type!;
  }
}
