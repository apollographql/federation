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
  valueFromASTUntyped,
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
  Extension
} from "./definitions";

function buildValue(value?: ValueNode): any {
  // TODO: Should we rewrite a version of valueFromAST instead of using valueFromASTUntyped? Afaict, what we're missing out on is
  // 1) coercions, which concretely, means:
  //   - for enums, we get strings
  //   - for int, we don't get the validation that it should be a 32bit value.
  //   - for ID, which accepts strings and int, we don't get int converted to string.
  //   - for floats, we get either int or float, we don't get int converted to float.
  //   - we don't get any custom coercion (but neither is buildSchema in graphQL-js anyway).
  // 2) type validation.
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
  const schema = new Schema(options?.blueprint);
  // We do a first pass to add all empty types and directives definition. This ensure any reference on one of
  // those can be resolved in the 2nd pass, regardless of the order of the definitions in the AST.
  const { directiveDefinitions, schemaDefinitions, schemaExtensions } = buildNamedTypeAndDirectivesShallow(documentNode, schema);

  // We then deal with directive definition first. This is mainly for the sake of core schemas: the core schema
  // handling in `Schema` detects that the schema is a core one when it see the application of `@core(feature: ".../core/...")`
  // to the schema element. But that detection necessitates that the corresponding directive definition has been fully
  // populated (and at this point, we don't really know the name of the `@core` directive since it can be renamed, so
  // we just handle all directives).
  for (const directiveDefinitionNode of directiveDefinitions) {
    buildDirectiveDefinitionInner(directiveDefinitionNode, schema.directive(directiveDefinitionNode.name.value)!);
  }
  for (const schemaDefinition of schemaDefinitions) {
    buildSchemaDefinitionInner(schemaDefinition, schema.schemaDefinition);
  }
  for (const schemaExtension of schemaExtensions) {
    buildSchemaDefinitionInner(schemaExtension, schema.schemaDefinition, schema.schemaDefinition.newExtension());
  }

  schema.blueprint.onDirectiveDefinitionAndSchemaParsed(schema);

  for (const definitionNode of documentNode.definitions) {
    switch (definitionNode.kind) {
      case 'OperationDefinition':
      case 'FragmentDefinition':
        throw new GraphQLError("Invalid executable definition found while building schema", definitionNode);
      case 'ScalarTypeDefinition':
      case 'ObjectTypeDefinition':
      case 'InterfaceTypeDefinition':
      case 'UnionTypeDefinition':
      case 'EnumTypeDefinition':
      case 'InputObjectTypeDefinition':
        buildNamedTypeInner(definitionNode, schema.type(definitionNode.name.value)!, schema.blueprint);
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
        buildNamedTypeInner(definitionNode, toExtend, schema.blueprint, extension);
        break;
    }
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
      case 'ScalarTypeExtension':
      case 'ObjectTypeExtension':
      case 'InterfaceTypeExtension':
      case 'UnionTypeExtension':
      case 'EnumTypeExtension':
      case 'InputObjectTypeExtension':
        // Note that because of extensions, this may be called multiple times for the same type.
        // But at the same time, we want to allow redefining built-in types, because some users do it.
        const existing = schema.type(definitionNode.name.value);
        if (!existing || existing.isBuiltIn) {
          schema.addType(newNamedType(withoutTrailingDefinition(definitionNode.kind), definitionNode.name.value));
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

function withNodeAttachedToError(operation: () => void, node: ASTNode) {
  try {
    operation();
  } catch (e) {
    if (e instanceof GraphQLError) {
      const allNodes: ASTNode | ASTNode[] = e.nodes ? [node, ...e.nodes] : node;
      throw new GraphQLError(
        e.message,
        allNodes,
        e.source,
        e.positions,
        e.path,
        e,
        e.extensions
      );
    } else {
      throw e;
    }
  }
}

function buildSchemaDefinitionInner(
  schemaNode: SchemaDefinitionNode | SchemaExtensionNode,
  schemaDefinition: SchemaDefinition,
  extension?: Extension<SchemaDefinition>
) {
  for (const opTypeNode of schemaNode.operationTypes ?? []) {
    withNodeAttachedToError(
      () => schemaDefinition.setRoot(opTypeNode.operation, opTypeNode.type.name.value).setOfExtension(extension),
      opTypeNode);
  }
  schemaDefinition.sourceAST = schemaNode;
  if ('description' in schemaNode) {
    schemaDefinition.description = schemaNode.description?.value;
  }
  buildAppliedDirectives(schemaNode, schemaDefinition, extension);
}

function buildAppliedDirectives(
  elementNode: NodeWithDirectives,
  element: SchemaElement<any, any>,
  extension?: Extension<any>
) {
  for (const directive of elementNode.directives ?? []) {
    withNodeAttachedToError(() => {
      const d = element.applyDirective(directive.name.value, buildArgs(directive));
      d.setOfExtension(extension);
      d.sourceAST = directive;
    }, directive);
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
        buildFieldDefinitionInner(fieldNode, field);
      }
      for (const itfNode of definitionNode.interfaces ?? []) {
        withNodeAttachedToError(
          () => {
            const itfName = itfNode.name.value;
            if (fieldBasedType.implementsInterface(itfName)) {
              throw new GraphQLError(`Type ${type} can only implement ${itfName} once.`);
            }
            fieldBasedType.addImplementedInterface(itfName).setOfExtension(extension);
          },
          itfNode);
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
              throw new GraphQLError(`Union type ${unionType} can only include type ${name} once.`);
            }
            unionType.addType(name).setOfExtension(extension);
          },
          namedType);
      }
      break;
    case 'EnumTypeDefinition':
    case 'EnumTypeExtension':
      const enumType = type as EnumType;
      for (const enumVal of definitionNode.values ?? []) {
        const v = enumType.addValue(enumVal.name.value);
        v.description = enumVal.description?.value;
        v.setOfExtension(extension);
        buildAppliedDirectives(enumVal, v);
      }
      break;
    case 'InputObjectTypeDefinition':
    case 'InputObjectTypeExtension':
      const inputObjectType = type as InputObjectType;
      for (const fieldNode of definitionNode.fields ?? []) {
        const field = inputObjectType.addField(fieldNode.name.value);
        field.setOfExtension(extension);
        buildInputFieldDefinitionInner(fieldNode, field);
      }
      break;
  }
  buildAppliedDirectives(definitionNode, type, extension);
  type.description = definitionNode.description?.value;
  type.sourceAST = definitionNode;
}

function buildFieldDefinitionInner(fieldNode: FieldDefinitionNode, field: FieldDefinition<any>) {
  const type = buildTypeReferenceFromAST(fieldNode.type, field.schema());
  field.type = ensureOutputType(type, field.coordinate, fieldNode);
  for (const inputValueDef of fieldNode.arguments ?? []) {
    buildArgumentDefinitionInner(inputValueDef, field.addArgument(inputValueDef.name.value));
  }
  buildAppliedDirectives(fieldNode, field);
  field.description = fieldNode.description?.value;
  field.sourceAST = fieldNode;
}

function ensureOutputType(type: Type, what: string, node: ASTNode): OutputType {
  if (isOutputType(type)) {
    return type;
  } else {
    throw new GraphQLError(`The type of ${what} must be Output Type but got: ${type}, a ${type.kind}.`, node);
  }
}

function ensureInputType(type: Type, what: string, node: ASTNode): InputType {
  if (isInputType(type)) {
    return type;
  } else {
    throw new GraphQLError(`The type of ${what} must be Input Type but got: ${type}, a ${type.kind}.`, node);
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

function buildArgumentDefinitionInner(inputNode: InputValueDefinitionNode, arg: ArgumentDefinition<any>) {
  const type = buildTypeReferenceFromAST(inputNode.type, arg.schema());
  arg.type = ensureInputType(type, arg.coordinate, inputNode);
  arg.defaultValue = buildValue(inputNode.defaultValue);
  buildAppliedDirectives(inputNode, arg);
  arg.description = inputNode.description?.value;
  arg.sourceAST = inputNode;
}

function buildInputFieldDefinitionInner(fieldNode: InputValueDefinitionNode, field: InputFieldDefinition) {
  const type = buildTypeReferenceFromAST(fieldNode.type, field.schema());
  field.type = ensureInputType(type, field.coordinate, fieldNode);
  field.defaultValue = buildValue(fieldNode.defaultValue);
  buildAppliedDirectives(fieldNode, field);
  field.description = fieldNode.description?.value;
  field.sourceAST = fieldNode;
}

function buildDirectiveDefinitionInner(directiveNode: DirectiveDefinitionNode, directive: DirectiveDefinition) {
  for (const inputValueDef of directiveNode.arguments ?? []) {
    buildArgumentDefinitionInner(inputValueDef, directive.addArgument(inputValueDef.name.value));
  }
  directive.repeatable = directiveNode.repeatable;
  const locations = directiveNode.locations.map(({ value }) => value as DirectiveLocation);
  directive.addLocations(...locations);
  directive.description = directiveNode.description?.value;
  directive.sourceAST = directiveNode;
}
