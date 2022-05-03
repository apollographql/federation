import {
  DefinitionNode,
  DirectiveDefinitionNode,
  DirectiveLocation,
  DirectiveNode,
  DocumentNode,
  FieldDefinitionNode,
  GraphQLError,
  InputValueDefinitionNode,
  parse,
  SchemaDefinitionNode,
  Source,
  TypeNode,
  ValueNode,
  NamedTypeNode,
  ArgumentNode,
  StringValueNode,
  ASTNode,
  SchemaExtensionNode,
  parseType,
  Kind,
} from "graphql";
import { Maybe } from "graphql/jsutils/Maybe";
import { valueFromASTUntyped } from "./values";
import {
  SchemaBlueprint,
  Schema,
  newNamedType,
  NamedTypeKind,
  NamedType,
  SchemaDefinition,
  SchemaElement,
  ObjectType,
  InterfaceType,
  FieldDefinition,
  Type,
  ListType,
  OutputType,
  isOutputType,
  isInputType,
  InputType,
  NonNullType,
  ArgumentDefinition,
  InputFieldDefinition,
  DirectiveDefinition,
  UnionType,
  InputObjectType,
  EnumType,
  Extension,
  ErrGraphQLValidationFailed,
  errorCauses,
} from "./definitions";

function buildValue(value?: ValueNode): any {
  return value ? valueFromASTUntyped(value) : undefined;
}

export type BuildSchemaOptions = {
  blueprint?: SchemaBlueprint,
  validate?: boolean,
}

export function buildSchema(source: string | Source, options?: BuildSchemaOptions): Schema {
  return buildSchemaFromAST(parse(source), options);
}

export function buildSchemaFromAST(
  documentNode: DocumentNode,
  options?: BuildSchemaOptions,
): Schema {
  const errors: GraphQLError[] = [];
  const schema = new Schema(options?.blueprint);
  // We do a first pass to add all empty types and directives definition. This ensure any reference on one of
  // those can be resolved in the 2nd pass, regardless of the order of the definitions in the AST.
  const { directiveDefinitions, schemaDefinitions, schemaExtensions } = buildNamedTypeAndDirectivesShallow(documentNode, schema);

  // We then deal with directive definition first. This is mainly for the sake of core schemas: the core schema
  // handling in `Schema` detects that the schema is a core one when it see the application of `@core(feature: ".../core/...")`
  // to the schema element. But that detection necessitates that the corresponding directive definition has been fully
  // populated (and at this point, we don't really know the name of the `@core` directive since it can be renamed, so
  // we just handle all directives).
  // Note that one subtlety is that we skip, for now, directive _applications_ within those directive definitions (we can
  // have such applications on the arguments). The reason is again core schema related: we haven't yet properly detected
  // if the schema if a core-schema yet, and for federation subgraphs, we haven't yet "imported" federation definitions.
  // So if one of those directive application was relying on that "importing", it would fail at this point. Which is why
  // directive application is delayed to later in that method.
  for (const directiveDefinitionNode of directiveDefinitions) {
    buildDirectiveDefinitionInnerWithoutDirectiveApplications(directiveDefinitionNode, schema.directive(directiveDefinitionNode.name.value)!, errors);
  }
  for (const schemaDefinition of schemaDefinitions) {
    buildSchemaDefinitionInner(schemaDefinition, schema.schemaDefinition, errors);
  }
  for (const schemaExtension of schemaExtensions) {
    buildSchemaDefinitionInner(schemaExtension, schema.schemaDefinition, errors, schema.schemaDefinition.newExtension());
  }

  // The following is a no-op for "standard" schema, but for federation subgraphs, this is where we handle the auto-addition
  // of imported federation directive definitions. That is why we have avoid looking at directive applications within
  // directive definition earlier: if one of those application was of an imported federation directive, the definition
  // wouldn't be presence before this point and we'd have triggered an error. After this, we can handle any directive
  // application safely.
  errors.push(...schema.blueprint.onDirectiveDefinitionAndSchemaParsed(schema));

  for (const directiveDefinitionNode of directiveDefinitions) {
    buildDirectiveApplicationsInDirectiveDefinition(directiveDefinitionNode, schema.directive(directiveDefinitionNode.name.value)!, errors);
  }

  for (const definitionNode of documentNode.definitions) {
    switch (definitionNode.kind) {
      case 'OperationDefinition':
      case 'FragmentDefinition':
        errors.push(new GraphQLError("Invalid executable definition found while building schema", definitionNode));
        continue;
      case 'ScalarTypeDefinition':
      case 'ObjectTypeDefinition':
      case 'InterfaceTypeDefinition':
      case 'UnionTypeDefinition':
      case 'EnumTypeDefinition':
      case 'InputObjectTypeDefinition':
        buildNamedTypeInner(definitionNode, schema.type(definitionNode.name.value)!, schema.blueprint, errors);
        break;
      case 'ScalarTypeExtension':
      case 'ObjectTypeExtension':
      case 'InterfaceTypeExtension':
      case 'UnionTypeExtension':
      case 'EnumTypeExtension':
      case 'InputObjectTypeExtension':
        const toExtend = schema.type(definitionNode.name.value)!;
        const extension = toExtend.newExtension();
        extension.sourceAST = definitionNode;
        buildNamedTypeInner(definitionNode, toExtend, schema.blueprint, errors, extension);
        break;
    }
  }

  // Note: we could try calling `schema.validate()` regardless of errors building the schema and merge the resulting
  // errors, and there is some subset of cases where this be a tad more convenient (as the user would get all the errors
  // at once), but in most cases a bunch of the errors thrown by `schema.validate()` would actually be consequences of
  // the schema not be properly built in the first place and those errors would be confusing to the user. And avoiding
  // confusing users probably trumps a rare minor convenience.
  if (errors.length > 0) {
    throw ErrGraphQLValidationFailed(errors);
  }

  if (options?.validate ?? true) {
    schema.validate();
  }

  return schema;
}

function buildNamedTypeAndDirectivesShallow(documentNode: DocumentNode, schema: Schema): {
  directiveDefinitions: DirectiveDefinitionNode[],
  schemaDefinitions: SchemaDefinitionNode[],
  schemaExtensions: SchemaExtensionNode[],
}  {
  const directiveDefinitions = [];
  const schemaDefinitions = [];
  const schemaExtensions = [];
  for (const definitionNode of documentNode.definitions) {
    switch (definitionNode.kind) {
      case 'SchemaDefinition':
        schemaDefinitions.push(definitionNode);
        break;
      case 'SchemaExtension':
        schemaExtensions.push(definitionNode);
        break;
      case 'ScalarTypeDefinition':
      case 'ObjectTypeDefinition':
      case 'InterfaceTypeDefinition':
      case 'UnionTypeDefinition':
      case 'EnumTypeDefinition':
      case 'InputObjectTypeDefinition':
        let type = schema.type(definitionNode.name.value);
        // Note that the type may already exists due to an extension having been processed first, but we know we
        // have seen 2 definitions (which is invalid) if the definition has `preserverEmptyDefnition` already set
        // since it's only set for definitions, not extensions. 
        // Also note that we allow to redefine built-ins.
        if (!type || type.isBuiltIn) {
          type = schema.addType(newNamedType(withoutTrailingDefinition(definitionNode.kind), definitionNode.name.value));
        } else if (type.preserveEmptyDefinition)  {
          // Note: we reuse the same error message than graphQL-js would output
          throw new GraphQLError(`There can be only one type named "${definitionNode.name.value}"`);
        }
        // It's possible for the type definition to be empty, because it is valid graphQL to have:
        //   type Foo
        //
        //   extend type Foo {
        //     bar: Int
        //   }
        // and we need a way to distinguish between the case above, and the case where only an extension is provided.
        // `preserveEmptyDefinition` serves that purpose.
        // Note that we do this even if the type was already existing because an extension could have been processed
        // first and have created the definition, but we still want to remember that the definition _does_ exists.
        type.preserveEmptyDefinition = true;
        break;
      case 'ScalarTypeExtension':
      case 'ObjectTypeExtension':
      case 'InterfaceTypeExtension':
      case 'UnionTypeExtension':
      case 'EnumTypeExtension':
      case 'InputObjectTypeExtension':
        const existing = schema.type(definitionNode.name.value);
        // In theory, graphQL does not let you have an extension without a corresponding definition. However,
        // 1) this is validated later, so there is no real reason to do it here and
        // 2) we actually accept it for federation subgraph (due to federation 1 mostly as it's not strictly needed
        //   for federation 22, but it is still supported to ease migration there too).
        // So if the type exists, we simply create it. However, we don't set `preserveEmptyDefinition` since it
        // is _not_ a definition.
        if (!existing) {
          schema.addType(newNamedType(withoutTrailingDefinition(definitionNode.kind), definitionNode.name.value));
        } else if (existing.isBuiltIn) {
          throw new GraphQLError(`Cannot extend built-in type "${definitionNode.name.value}"`);
        }
        break;
      case 'DirectiveDefinition':
        directiveDefinitions.push(definitionNode);
        schema.addDirectiveDefinition(definitionNode.name.value);
        break;
    }
  }
  return {
    directiveDefinitions,
    schemaDefinitions,
    schemaExtensions,
  }
}

type NodeWithDirectives = {directives?: ReadonlyArray<DirectiveNode>};
type NodeWithDescription = {description?: Maybe<StringValueNode>};
type NodeWithArguments = {arguments?: ReadonlyArray<ArgumentNode>};

function withoutTrailingDefinition(str: string): NamedTypeKind {
  const endString = str.endsWith('Definition') ? 'Definition' : 'Extension';
  return str.slice(0, str.length - endString.length) as NamedTypeKind;
}

function getReferencedType(node: NamedTypeNode, schema: Schema): NamedType {
  const type = schema.type(node.name.value);
  if (!type) {
    throw new GraphQLError(`Unknown type ${node.name.value}`, node);
  }
  return type;
}

function withNodeAttachedToError(operation: () => void, node: ASTNode, errors: GraphQLError[]) {
  try {
    operation();
  } catch (e) {
    const causes = errorCauses(e);
    if (causes) {
      for (const cause of causes) {
        const allNodes: ASTNode | ASTNode[] = cause.nodes ? [node, ...cause.nodes] : node;
        errors.push(new GraphQLError(
          cause.message,
          allNodes,
          cause.source,
          cause.positions,
          cause.path,
          cause,
          cause.extensions
        ));
      }
    } else {
      throw e;
    }
  }
}

function buildSchemaDefinitionInner(
  schemaNode: SchemaDefinitionNode | SchemaExtensionNode,
  schemaDefinition: SchemaDefinition,
  errors: GraphQLError[],
  extension?: Extension<SchemaDefinition>
) {
  for (const opTypeNode of schemaNode.operationTypes ?? []) {
    withNodeAttachedToError(
      () => schemaDefinition.setRoot(opTypeNode.operation, opTypeNode.type.name.value).setOfExtension(extension),
      opTypeNode,
      errors,
    );
  }
  schemaDefinition.sourceAST = schemaNode;
  if ('description' in schemaNode) {
    schemaDefinition.description = schemaNode.description?.value;
  }
  buildAppliedDirectives(schemaNode, schemaDefinition, errors, extension);
}

function buildAppliedDirectives(
  elementNode: NodeWithDirectives,
  element: SchemaElement<any, any>,
  errors: GraphQLError[],
  extension?: Extension<any>
) {
  for (const directive of elementNode.directives ?? []) {
    withNodeAttachedToError(
      () => {
        const d = element.applyDirective(directive.name.value, buildArgs(directive));
        d.setOfExtension(extension);
        d.sourceAST = directive;
      },
      directive,
      errors,
    );
  }
}

function buildArgs(argumentsNode: NodeWithArguments): Record<string, any> {
  const args = Object.create(null);
  for (const argNode of argumentsNode.arguments ?? []) {
    args[argNode.name.value] = buildValue(argNode.value);
  }
  return args;
}

function buildNamedTypeInner(
  definitionNode: DefinitionNode & NodeWithDirectives & NodeWithDescription,
  type: NamedType,
  blueprint: SchemaBlueprint,
  errors: GraphQLError[],
  extension?: Extension<any>,
) {
  switch (definitionNode.kind) {
    case 'ObjectTypeDefinition':
    case 'ObjectTypeExtension':
    case 'InterfaceTypeDefinition':
    case 'InterfaceTypeExtension':
      const fieldBasedType = type as ObjectType | InterfaceType;
      for (const fieldNode of definitionNode.fields ?? []) {
        if (blueprint.ignoreParsedField(type, fieldNode.name.value)) {
          continue;
        }
        const field = fieldBasedType.addField(fieldNode.name.value);
        field.setOfExtension(extension);
        buildFieldDefinitionInner(fieldNode, field, errors);
      }
      for (const itfNode of definitionNode.interfaces ?? []) {
        withNodeAttachedToError(
          () => {
            const itfName = itfNode.name.value;
            if (fieldBasedType.implementsInterface(itfName)) {
              throw new GraphQLError(`Type "${type}" can only implement "${itfName}" once.`);
            }
            fieldBasedType.addImplementedInterface(itfName).setOfExtension(extension);
          },
          itfNode,
          errors,
        );
      }
      break;
    case 'UnionTypeDefinition':
    case 'UnionTypeExtension':
      const unionType = type as UnionType;
      for (const namedType of definitionNode.types ?? []) {
        withNodeAttachedToError(
          () => {
            const name = namedType.name.value;
            if (unionType.hasTypeMember(name)) {
              throw new GraphQLError(`Union type "${unionType}" can only include type "${name}" once.`);
            }
            unionType.addType(name).setOfExtension(extension);
          },
          namedType,
          errors,
        );
      }
      break;
    case 'EnumTypeDefinition':
    case 'EnumTypeExtension':
      const enumType = type as EnumType;
      for (const enumVal of definitionNode.values ?? []) {
        const v = enumType.addValue(enumVal.name.value);
        if (enumVal.description) {
          v.description = enumVal.description.value;
        }
        v.setOfExtension(extension);
        buildAppliedDirectives(enumVal, v, errors);
      }
      break;
    case 'InputObjectTypeDefinition':
    case 'InputObjectTypeExtension':
      const inputObjectType = type as InputObjectType;
      for (const fieldNode of definitionNode.fields ?? []) {
        const field = inputObjectType.addField(fieldNode.name.value);
        field.setOfExtension(extension);
        buildInputFieldDefinitionInner(fieldNode, field, errors);
      }
      break;
  }
  buildAppliedDirectives(definitionNode, type, errors, extension);
  if (definitionNode.description) {
    type.description = definitionNode.description.value;
  }
  type.sourceAST = definitionNode;
}

function buildFieldDefinitionInner(
  fieldNode: FieldDefinitionNode,
  field: FieldDefinition<any>,
  errors: GraphQLError[],
) {
  const type = buildTypeReferenceFromAST(fieldNode.type, field.schema());
  field.type = validateOutputType(type, field.coordinate, fieldNode, errors);
  for (const inputValueDef of fieldNode.arguments ?? []) {
    buildArgumentDefinitionInner(inputValueDef, field.addArgument(inputValueDef.name.value), errors, true);
  }
  buildAppliedDirectives(fieldNode, field, errors);
  field.description = fieldNode.description?.value;
  field.sourceAST = fieldNode;
}

function validateOutputType(type: Type, what: string, node: ASTNode, errors: GraphQLError[]): OutputType | undefined {
  if (isOutputType(type)) {
    return type;
  } else {
    errors.push(new GraphQLError(`The type of "${what}" must be Output Type but got "${type}", a ${type.kind}.`, node));
    return undefined;
  }
}

function validateInputType(type: Type, what: string, node: ASTNode, errors: GraphQLError[]): InputType | undefined {
  if (isInputType(type)) {
    return type;
  } else {
    errors.push(new GraphQLError(`The type of "${what}" must be Input Type but got "${type}", a ${type.kind}.`, node));
    return undefined;
  }
}

export function builtTypeReference(encodedType: string, schema: Schema): Type {
  return buildTypeReferenceFromAST(parseType(encodedType), schema);
}

function buildTypeReferenceFromAST(typeNode: TypeNode, schema: Schema): Type {
  switch (typeNode.kind) {
    case Kind.LIST_TYPE:
      return new ListType(buildTypeReferenceFromAST(typeNode.type, schema));
    case Kind.NON_NULL_TYPE:
      const wrapped = buildTypeReferenceFromAST(typeNode.type, schema);
      if (wrapped.kind == Kind.NON_NULL_TYPE) {
        throw new GraphQLError(`Cannot apply the non-null operator (!) twice to the same type`, typeNode);
      }
      return new NonNullType(wrapped);
    default:
      return getReferencedType(typeNode, schema);
  }
}

function buildArgumentDefinitionInner(
  inputNode: InputValueDefinitionNode,
  arg: ArgumentDefinition<any>,
  errors: GraphQLError[],
  includeDirectiveApplication: boolean,
) {
  const type = buildTypeReferenceFromAST(inputNode.type, arg.schema());
  arg.type = validateInputType(type, arg.coordinate, inputNode, errors);
  arg.defaultValue = buildValue(inputNode.defaultValue);
  if (includeDirectiveApplication) {
    buildAppliedDirectives(inputNode, arg, errors);
  }
  arg.description = inputNode.description?.value;
  arg.sourceAST = inputNode;
}

function buildInputFieldDefinitionInner(
  fieldNode: InputValueDefinitionNode,
  field: InputFieldDefinition,
  errors: GraphQLError[],
) {
  const type = buildTypeReferenceFromAST(fieldNode.type, field.schema());
  field.type = validateInputType(type, field.coordinate, fieldNode, errors);
  field.defaultValue = buildValue(fieldNode.defaultValue);
  buildAppliedDirectives(fieldNode, field, errors);
  field.description = fieldNode.description?.value;
  field.sourceAST = fieldNode;
}

function buildDirectiveDefinitionInnerWithoutDirectiveApplications(
  directiveNode: DirectiveDefinitionNode,
  directive: DirectiveDefinition,
  errors: GraphQLError[],
) {
  for (const inputValueDef of directiveNode.arguments ?? []) {
    buildArgumentDefinitionInner(inputValueDef, directive.addArgument(inputValueDef.name.value), errors, false);
  }
  directive.repeatable = directiveNode.repeatable;
  const locations = directiveNode.locations.map(({ value }) => value as DirectiveLocation);
  directive.addLocations(...locations);
  directive.description = directiveNode.description?.value;
  directive.sourceAST = directiveNode;
}

function buildDirectiveApplicationsInDirectiveDefinition(
  directiveNode: DirectiveDefinitionNode,
  directive: DirectiveDefinition,
  errors: GraphQLError[],
) {
  for (const inputValueDef of directiveNode.arguments ?? []) {
    buildAppliedDirectives(inputValueDef, directive.argument(inputValueDef.name.value)!, errors);
  }
}
