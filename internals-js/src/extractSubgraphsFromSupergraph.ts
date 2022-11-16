import {
  baseType,
  CompositeType,
  copyDirectiveDefinitionToSchema,
  Directive,
  FieldDefinition,
  InputFieldDefinition,
  InputObjectType,
  InterfaceType,
  isExecutableDirectiveLocation,
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
  newEmptyFederation2Schema,
  parseFieldSetArgument,
  removeInactiveProvidesAndRequires,
} from "./federation";
import { CoreSpecDefinition, FeatureVersion } from "./coreSpec";
import { JoinSpecDefinition } from "./joinSpec";
import { FederationMetadata, Subgraph, Subgraphs } from "./federation";
import { assert } from "./utils";
import { validateSupergraph } from "./supergraphs";
import { builtTypeReference } from "./buildSchema";
import { isSubtype } from "./types";
import { printSchema } from "./print";
import { parseSelectionSet } from "./operations";
import fs from 'fs';
import path from 'path';
import { validateStringContainsBoolean } from "./utils";
import { errorCauses, printErrors } from ".";

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
    const subgraph = new Subgraph(info.name, info.url, newEmptyFederation2Schema());
    subgraphs.add(subgraph);
    graphEnumNameToSubgraphName.set(value.name, info.name);
  }
  return [subgraphs, graphEnumNameToSubgraphName];
}

class SubgraphExtractionError {
  constructor(
    readonly originalError: any,
    readonly subgraph: Subgraph,
  ) {
  }
}

function collectFieldReachableTypesForSubgraph(
  supergraph: Schema,
  subgraphName: string,
  addReachableType: (t: NamedType) => void,
  fieldInfoInSubgraph: (f: FieldDefinition<any> | InputFieldDefinition, subgraphName: string) => { isInSubgraph: boolean, typesInFederationDirectives: NamedType[] },
  typeInfoInSubgraph: (t: NamedType, subgraphName: string) => { isEntityWithKeyInSubgraph: boolean, typesInFederationDirectives: NamedType[] },
): void {
  const seenTypes = new Set<string>();
  // The types reachable at "top-level" are both the root types, plus any entity type with a key in this subgraph.
  const stack = supergraph.schemaDefinition.roots().map((root) => root.type as NamedType)
  for (const type of supergraph.types()) {
    const { isEntityWithKeyInSubgraph, typesInFederationDirectives } = typeInfoInSubgraph(type, subgraphName);
    if (isEntityWithKeyInSubgraph) {
      stack.push(type);
    }
    typesInFederationDirectives.forEach((t) => stack.push(t));
  }
  while (stack.length > 0) {
    const type = stack.pop()!;
    addReachableType(type);
    if (seenTypes.has(type.name)) {
      continue;
    }
    seenTypes.add(type.name);
    switch (type.kind) {
      // @ts-expect-error: we fall-through to ObjectType for fields and implemented interfaces.
      case 'InterfaceType':
        // If an interface if reachable, then all of its implementation are too (a field returning the interface could return any of the
        // implementation at runtime typically).
        type.allImplementations().forEach((t) => stack.push(t));
      case 'ObjectType':
        type.interfaces().forEach((t) => stack.push(t));
        for (const field of type.fields()) {
          const { isInSubgraph, typesInFederationDirectives } = fieldInfoInSubgraph(field, subgraphName);
          if (isInSubgraph) {
            field.arguments().forEach((arg) => stack.push(baseType(arg.type!)));
            stack.push(baseType(field.type!));
            typesInFederationDirectives.forEach((t) => stack.push(t));
          }
        }
        break;
      case 'InputObjectType':
        for (const field of type.fields()) {
          const { isInSubgraph, typesInFederationDirectives } = fieldInfoInSubgraph(field, subgraphName);
          if (isInSubgraph) {
            stack.push(baseType(field.type!));
            typesInFederationDirectives.forEach((t) => stack.push(t));
          }
        }
        break;
      case 'UnionType':
        type.members().forEach((m) => stack.push(m.type));
        break;
    }
  }

  for (const directive of supergraph.directives()) {
    // In fed1 supergraphs, which is the only place this is called, only executable directive from subgraph only ever made
    // it to the supergraph. Skipping anything else saves us from worrying about supergraph-specific directives too.
    if (!directive.hasExecutableLocations()) {
      continue;
    }
    directive.arguments().forEach((arg) => stack.push(baseType(arg.type!)));
  }
}

function collectFieldReachableTypesForAllSubgraphs(
  supergraph: Schema,
  allSubgraphs: readonly string[],
  fieldInfoInSubgraph: (f: FieldDefinition<any> | InputFieldDefinition, subgraphName: string) => { isInSubgraph: boolean, typesInFederationDirectives: NamedType[] },
  typeInfoInSubgraph: (t: NamedType, subgraphName: string) => { isEntityWithKeyInSubgraph: boolean, typesInFederationDirectives: NamedType[] },
): Map<string, Set<string>> {
  const reachableTypesBySubgraphs = new Map<string, Set<string>>();
  for (const subgraphName of allSubgraphs) {
    const reachableTypes = new Set<string>();
    collectFieldReachableTypesForSubgraph(
      supergraph,
      subgraphName,
      (t) => reachableTypes.add(t.name),
      fieldInfoInSubgraph,
      typeInfoInSubgraph,
    );
    reachableTypesBySubgraphs.set(subgraphName, reachableTypes);
  }
  return reachableTypesBySubgraphs;
}

function typesUsedInFederationDirective(fieldSet: string | undefined, parentType: CompositeType): NamedType[] {
  if (!fieldSet) {
    return [];
  }

  const usedTypes: NamedType[] = [];
  parseSelectionSet({
    parentType,
    source: fieldSet,
    fieldAccessor: (type, fieldName) => {
      const field = type.field(fieldName);
      if (field) {
        usedTypes.push(baseType(field.type!));
      }
      return field;
    },
    validate: false,
  });
  return usedTypes;
}

export function extractSubgraphsFromSupergraph(supergraph: Schema): Subgraphs {
  const [coreFeatures, joinSpec] = validateSupergraph(supergraph);
  const isFed1 = joinSpec.version.equals(new FeatureVersion(0, 1));
  try {
    // We first collect the subgraphs (creating an empty schema that we'll populate next for each).
    const [subgraphs, graphEnumNameToSubgraphName] = collectEmptySubgraphs(supergraph, joinSpec);
    const typeDirective = joinSpec.typeDirective(supergraph);
    const implementsDirective = joinSpec.implementsDirective(supergraph);
    const ownerDirective = joinSpec.ownerDirective(supergraph);
    const fieldDirective = joinSpec.fieldDirective(supergraph);
    const unionMemberDirective = joinSpec.unionMemberDirective(supergraph);
    const enumValueDirective = joinSpec.enumValueDirective(supergraph);

    const getSubgraph = (application: Directive<any, { graph?: string }>) => {
      const graph = application.arguments().graph;
      return graph ? graphEnumNameToSubgraphName.get(graph) : undefined;
    };

    /*
     * Fed2 supergraph have "provenance" information for all types and fields, so we can faithfully extract subgraph relatively easily.
     * For fed1 supergraph however, only entity types are marked with `@join__type` and `@join__field`. Which mean that for value types,
     * we cannot directly know in which subgraphs they were initially defined. One strategy consists in "extracting" value types into
     * all subgraphs blindly: functionally, having some unused types in an extracted subgraph schema does not matter much. However, adding
     * those useless types increases memory usage, and we've seen some case with lots of subgraphs and lots of value types where those
     * unused types balloon up memory usage (from 100MB to 1GB in one example; obviously, this is made worst by the fact that javascript
     * is pretty memory heavy in the first place). So to avoid that problem, for fed1 supergraph, we do a first pass where we collect
     * for all the subgraphs the set of types that are actually reachable in that subgraph. As we extract do the actual type extraction,
     * we use this to ignore non-reachable types for any given subgraph.
     */
    let includeTypeInSubgraph: (t: NamedType, name: string) => boolean = () => true;
    if (isFed1) {
      const reachableTypesBySubgraph = collectFieldReachableTypesForAllSubgraphs(
        supergraph,
        subgraphs.names(),
        (f, name) => {
          const fieldApplications: Directive<any, { graph?: string, requires?: string, provides?: string }>[] = f.appliedDirectivesOf(fieldDirective);
          if (fieldApplications.length) {
            const application = fieldApplications.find((application) => getSubgraph(application) === name);
            if (application) {
              const args = application.arguments();
              const typesInFederationDirectives =
                typesUsedInFederationDirective(args.provides, baseType(f.type!) as CompositeType)
                .concat(typesUsedInFederationDirective(args.requires, f.parent));
              return { isInSubgraph: true, typesInFederationDirectives };
            } else {
              return { isInSubgraph: false, typesInFederationDirectives: [] };
            }
          } else {
            // No field application depends on the "owner" directive on the type. If we have no owner, then the
            // field is in all subgraph and we return true. Otherwise, the field is only in the owner subgraph.
            // In any case, the field cannot have a requires or provides
            const ownerApplications = ownerDirective ? f.parent.appliedDirectivesOf(ownerDirective) : [];
            return { isInSubgraph: !ownerApplications.length || getSubgraph(ownerApplications[0]) == name, typesInFederationDirectives: [] };
          }
        },
        (t, name) => {
          const typeApplications: Directive<any, { graph: string, key?: string}>[] = t.appliedDirectivesOf(typeDirective);
          const application = typeApplications.find((application) => (application.arguments().key && (getSubgraph(application) === name)));
          if (application) {
            const typesInFederationDirectives = typesUsedInFederationDirective(application.arguments().key, t as CompositeType);
            return { isEntityWithKeyInSubgraph: true, typesInFederationDirectives };
          } else {
            return { isEntityWithKeyInSubgraph: false, typesInFederationDirectives: [] };
          }
        },
      );
      includeTypeInSubgraph = (t, name) => reachableTypesBySubgraph.get(name)?.has(t.name) ?? false;
    }

    // Next, we iterate on all types and add it to the proper subgraphs (along with any @key).
    // Note that we first add all types empty and populate the types next. This avoids having to care about the iteration
    // order if we have fields than depends on other types.
    for (const type of filteredTypes(supergraph, joinSpec, coreFeatures.coreDefinition)) {
      const typeApplications = type.appliedDirectivesOf(typeDirective);
      if (!typeApplications.length) {
        // Imply we don't know in which subgraph the type is, so we had it in all subgraph in which the type is reachable.
        subgraphs
          .values()
          .filter((sg) => includeTypeInSubgraph(type, sg.name))
          .map(sg => sg.schema).forEach(schema => schema.addType(newNamedType(type.kind, type.name)));
      } else {
        for (const application of typeApplications) {
          const args = application.arguments();
          const subgraphName = getSubgraph(application)!;
          const schema = subgraphs.get(subgraphName)!.schema;
          // We can have more than one type directive for a given subgraph
          let subgraphType = schema.type(type.name);
          if (!subgraphType) {
            const kind = args.isInterfaceObject ? 'ObjectType' : type.kind;
            subgraphType = schema.addType(newNamedType(kind, type.name));
            if (args.isInterfaceObject) {
              subgraphType.applyDirective('interfaceObject');
            }
          }
          if (args.key) {
            const { resolvable } = args;
            const directive = subgraphType.applyDirective('key', {'fields': args.key, resolvable});
            if (args.extension) {
              directive.setOfExtension(subgraphType.newExtension());
            }
          }
        }
      }
    }

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
                const isShareable = isObjectType(type) && subgraphs.values().filter((s) => s.schema.type(type.name)).length > 1;
                for (const subgraph of subgraphs) {
                  if (subgraph.schema.type(fieldBaseType.name)) {
                    const subgraphField = addSubgraphField(field, subgraph);
                    if (subgraphField && isShareable) {
                      subgraphField.applyDirective(subgraph.metadata().shareableDirective());
                    }
                  }
                }
              } else {
                assert(ownerApplications.length == 1, () => `Found multiple join__owner directives on type ${type}`)
                const subgraph = subgraphs.get(graphEnumNameToSubgraphName.get(ownerApplications[0].arguments().graph)!)!;
                const subgraphField = addSubgraphField(field, subgraph);
                assert(subgraphField, () => `Found join__owner directive on ${type} but no corresponding join__type`);
              }
            } else {
              const isShareable = isObjectType(type)
                && (fieldApplications as Directive<any, { external?: boolean, usedOverridden?: boolean }>[]).filter((application) => {
                  const args = application.arguments();
                  return !args.external && !args.usedOverridden;
                }).length > 1;

              for (const application of fieldApplications) {
                const args = application.arguments();
                // We use a @join__field with no graph to indicates when a field in the supergraph does not come
                // directly from any subgraph and there is thus nothing to do to "extract" it.
                if (!args.graph) {
                  continue;
                }
                const subgraph = subgraphs.get(graphEnumNameToSubgraphName.get(args.graph)!)!;
                const subgraphField = addSubgraphField(field, subgraph, args.type);
                if (!subgraphField) {
                  // It's unlikely but possible that a fed1 supergraph has a `@provides` on a field of a value type,
                  // and that value type is actually unreachable. Because we trim unreachable types for fed1 supergraph
                  // (see comment on `includeTypeInSubgraph` above), it would mean we get `undefined` here. It's fine
                  // however: the type is unreachable in this subgraph, so ignoring that field application is fine too.
                  assert(!includeTypeInSubgraph(type, subgraph.name), () => `Found join__field directive for graph ${subgraph.name} on field ${field.coordinate} but no corresponding join__type on ${type}`);
                  continue;
                }
                if (args.requires) {
                  subgraphField.applyDirective(subgraph.metadata().requiresDirective(), {'fields': args.requires});
                }
                if (args.provides) {
                  subgraphField.applyDirective(subgraph.metadata().providesDirective(), {'fields': args.provides});
                }
                if (args.external) {
                  subgraphField.applyDirective(subgraph.metadata().externalDirective());
                }
                if (args.usedOverridden) {
                  subgraphField.applyDirective(subgraph.metadata().externalDirective(), {'reason': '[overridden]'});
                }
                if (args.override) {
                  subgraphField.applyDirective(subgraph.metadata().overrideDirective(), {'from': args.override});
                }
                if (isShareable && !args.external && !args.usedOverridden) {
                  subgraphField.applyDirective(subgraph.metadata().shareableDirective());
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
              // Before version 0.3 of the join spec (before `enumValueDirective`), we were not recording which subgraph defined which values,
              // and instead aded all values to all subgraphs (at least if the type existed there).
              const addValue = !enumValueDirective 
                || value.appliedDirectivesOf(enumValueDirective).some((d) =>
                  graphEnumNameToSubgraphName.get(d.arguments().graph) === subgraph.name
                );
              if (addValue) {
                subgraphEnum.addValue(value.name);
              }
            }
          }
          break;
        case 'UnionType':
          for (const subgraph of subgraphs) {
            const subgraphUnion = subgraph.schema.type(type.name);
            if (!subgraphUnion) {
              continue;
            }
            assert(isUnionType(subgraphUnion), () => `${subgraphUnion} should be an enum but found a ${subgraphUnion.kind}`);
            let membersInSubgraph: string[];
            if (unionMemberDirective) {
              membersInSubgraph = type
                .appliedDirectivesOf(unionMemberDirective)
                .filter((d) => graphEnumNameToSubgraphName.get(d.arguments().graph) === subgraph.name)
                .map((d) => d.arguments().member);
            } else {
              // Before version 0.3 of the join spec, we were not recording which subgraph defined which members,
              // and instead aded all members to all subgraphs (at least if the type existed there).
              membersInSubgraph = type.types().map((t) => t.name);
            }
            for (const memberTypeName of membersInSubgraph) {
              const subgraphType = subgraph.schema.type(memberTypeName);
              if (subgraphType) {
                subgraphUnion.addType(subgraphType as ObjectType);
              }
            }
          }
          break;
      }
    }

    const allExecutableDirectives = supergraph.directives().filter((def) => def.hasExecutableLocations());
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

      // Lastly, we add all the "executable" directives from the supergraph to each subgraphs, as those may be part
      // of a query and end up in any subgraph fetches. We do this "last" to make sure that if one of the directive
      // use a type for an argument, that argument exists.
      // Note that we don't bother with non-executable directives at the moment since we've don't extract their
      // applications. It might become something we need later, but we don't so far.
      for (const definition of allExecutableDirectives) {
        // Note that we skip any potentially applied directives in the argument of the copied definition, because as said
        // in the comment above, we haven't copied type-system directives. And so far, we really don't care about those
        // applications.
        copyDirectiveDefinitionToSchema({
          definition,
          schema: subgraph.schema,
          copyDirectiveApplicationsInArguments: false,
          locationFilter: (loc) => isExecutableDirectiveLocation(loc),
        });
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
        for (const itf of subgraph.schema.interfaceTypes()) {
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
        subgraph.validate();
      } catch (e) {
        // This is going to be caught directly by the enclosing try-catch, but this is so we indicate the subgraph having the issue.
        throw new SubgraphExtractionError(e, subgraph);
      }
    }

    return subgraphs;
  } catch (e) {
    let error = e;
    let subgraph: Subgraph | undefined = undefined;
    // We want this catch to capture all errors happening during extraction, but the most common
    // case is likely going to be fed2 validation that fed1 didn't enforced, and those will be
    // throw when validating the extracted subgraphs, and n that case we use
    // `SubgraphExtractionError` to pass the subgraph that errored out, which allows us
    // to provide a bit more context in those cases.
    if (e instanceof SubgraphExtractionError) {
      error = e.originalError;
      subgraph = e.subgraph;
    }

    // There is 2 reasons this could happen:
    // 1. if the supergraph is a Fed1 one, because fed2 has stricter validations than fed1, this could be due to the supergraph
    //    containing something invalid that fed1 accepted and fed2 didn't (for instance, an invalid `@provides` selection).
    // 2. otherwise, this would be a bug (because fed1 compatibility excluded, we shouldn't extract invalid subgraphs from valid supergraphs).
    // We throw essentially the same thing in both cases, but adapt the message slightly.
    const impacted = subgraph ? `subgraph "${subgraph.name}"` : 'subgraphs';
    if (isFed1) {
      // Note that this could be a bug with the code handling fed1 as well, but it's more helpful to ask users to recompose their subgraphs with fed2 as either
      // it'll solve the issue and that's good, or we'll hit the other message anyway.
      const msg = `Error extracting ${impacted} from the supergraph: this might be due to errors in subgraphs that were mistakenly ignored by federation 0.x versions but are rejected by federation 2.\n`
        + 'Please try composing your subgraphs with federation 2: this should help precisely pinpoint the problems and, once fixed, generate a correct federation 2 supergraph';
      throw new Error(`${msg}.\n\nDetails:\n${errorToString(error)}`);
    } else {
      const msg = `Unexpected error extracting ${impacted} from the supergraph: this is either a bug, or the supergraph has been corrupted`;
      const dumpMsg = subgraph ? '\n\n' + maybeDumpSubgraphSchema(subgraph) : '';
      throw new Error(`${msg}.\n\nDetails:\n${errorToString(error)}${dumpMsg}`);
    }
  }
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
    return `Was not able to print generated subgraph for "${subgraph.name}" because: ${errorToString(e2)}`;
  }
}

function errorToString(e: any,): string {
  const causes = errorCauses(e);
  return causes ? printErrors(causes) : String(e);
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
    const field = (subgraphType as InputObjectType).addField(supergraphField.name, copiedType);
    field.defaultValue = supergraphField.defaultValue
    return field
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
      assert(subgraphType, () => `Cannot find type "${type.name}" in subgraph "${subgraphName}"`);
      return subgraphType;
  }
}

function addExternalFields(subgraph: Subgraph, supergraph: Schema, isFed1: boolean) {
  const metadata = subgraph.metadata();
  for (const type of subgraph.schema.types()) {
    if (!isObjectType(type) && !isInterfaceType(type)) {
      continue;
    }

    // First, handle @key
    for (const keyApplication of type.appliedDirectivesOf(metadata.keyDirective())) {
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
      for (const requiresApplication of field.appliedDirectivesOf(metadata.requiresDirective())) {
        addExternalFieldsFromDirectiveFieldSet(subgraph, type, requiresApplication, supergraph);
      }
      const fieldBaseType = baseType(field.type!);
      for (const providesApplication of field.appliedDirectivesOf(metadata.providesDirective())) {
        assert(isObjectType(fieldBaseType) || isInterfaceType(fieldBaseType), () => `Found @provides on field ${field.coordinate} whose type ${field.type!} (${fieldBaseType.kind}) is not an object or interface `);
        addExternalFieldsFromDirectiveFieldSet(subgraph, fieldBaseType, providesApplication, supergraph);
      }
    }

    // And then any constraint due to implemented interfaces.
    addExternalFieldsFromInterface(metadata, type);
  }
}

function addExternalFieldsFromDirectiveFieldSet(
  subgraph: Subgraph,
  parentType: ObjectType | InterfaceType,
  directive: Directive<NamedType | FieldDefinition<CompositeType>, {fields: any}>,
  supergraph: Schema,
  forceNonExternal: boolean = false,
) {
  const external = subgraph.metadata().externalDirective();

  const fieldAccessor = function (type: CompositeType, fieldName: string): FieldDefinition<any> {
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
  try {
    parseFieldSetArgument({parentType, directive, fieldAccessor, validate: false});
  } catch (e) {
    // Ignored on purpose: for fed1 supergraphs, it's possible that some of the fields defined in a federation directive
    // was _not_ defined in the subgraph because fed1 was not validating this properly (the validation wasn't handling
    // nested fields as it should), which may result in an error when trying to add those as an external field.
    // However, this is not the right place to throw. Instead, we ignore the problem and thus exit without having added
    // all the necessary fields, and so this very same directive will fail validation at the end of the extraction when
    // we do the final validation of the extracted subgraph (see end of `extractSubgraphsFromSupergraph`). And we prefer
    // failing then because 1) that later validation will collect all errors instead of failing on the first one and
    // 2) we already have special error messages and the ability to dump the extracted subgraphs for debug at that point,
    // so it's a much better place.
  }
}

function addExternalFieldsFromInterface(metadata: FederationMetadata, type: ObjectType | InterfaceType) {
  for (const itf of type.interfaces()) {
    for (const field of itf.fields()) {
      const typeField = type.field(field.name);
      if (!typeField) {
        copyFieldAsExternal(metadata, field, type);
      } else if (typeField.hasAppliedDirective(metadata.externalDirective())) {
        // A subtlety here is that a type may implements multiple interfaces providing a given field, and the field may
        // not have the exact same definition in all interface. So if we may have added the field in a previous loop
        // iteration, we need to check if we shouldn't update the field type.
        maybeUpdateFieldForInterface(typeField, field);
      }
    }
  }
}

function copyFieldAsExternal(metadata: FederationMetadata, field: FieldDefinition<InterfaceType>, type: ObjectType | InterfaceType) {
  const newField = type.addField(field.name, field.type);
  for (const arg of field.arguments()) {
    newField.addArgument(arg.name, arg.type, arg.defaultValue);
  }
  newField.applyDirective(metadata.externalDirective());
}

function maybeUpdateFieldForInterface(toModify: FieldDefinition<ObjectType | InterfaceType>, itfField: FieldDefinition<InterfaceType>) {
  // Note that we only care about the field type because while graphql does not allow contravariance of args for field implementations.
  // And while fed2 allow it when merging, this code doesn't run for fed2 generated supergraph, so this isn't a concern.
  if (!isSubtype(itfField.type!, toModify.type!)) {
    assert(isSubtype(toModify.type!, itfField.type!), () => `For ${toModify.coordinate}, expected ${itfField.type} and ${toModify.type} to be in a subtyping relationship`);
    toModify.type = itfField.type!;
  }
}
