import {
  DefinitionNode,
  DirectiveDefinitionNode,
  DirectiveLocationEnum,
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
  StringValueNode
} from "graphql";
import { Maybe } from "graphql/jsutils/Maybe";
import {
  BuiltIns,
  Schema,
  graphQLBuiltIns,
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
  EnumType
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

export function buildSchema(source: string | Source, builtIns: BuiltIns = graphQLBuiltIns): Schema {
  return buildSchemaFromAST(parse(source), builtIns);
}

export function buildSchemaFromAST(documentNode: DocumentNode, builtIns: BuiltIns = graphQLBuiltIns): Schema {
  const schema = new Schema(builtIns);
  // We do a first pass to add all empty types and directives definition. This ensure any reference on one of
  // those can be resolved in the 2nd pass, regardless of the order of the definitions in the AST.
  buildNamedTypeAndDirectivesShallow(documentNode, schema);
  for (const definitionNode of documentNode.definitions) {
    switch (definitionNode.kind) {
      case 'OperationDefinition':
      case 'FragmentDefinition':
        throw new GraphQLError("Invalid executable definition found while building schema", definitionNode);
      case 'SchemaDefinition':
        buildSchemaDefinitionInner(definitionNode, schema.schemaDefinition);
        break;
      case 'ScalarTypeDefinition':
      case 'ObjectTypeDefinition':
      case 'InterfaceTypeDefinition':
      case 'UnionTypeDefinition':
      case 'EnumTypeDefinition':
      case 'InputObjectTypeDefinition':
        buildNamedTypeInner(definitionNode, schema.type(definitionNode.name.value)!);
        break;
      case 'DirectiveDefinition':
        buildDirectiveDefinitionInner(definitionNode, schema.directive(definitionNode.name.value)!);
        break;
      case 'SchemaExtension':
      case 'ScalarTypeExtension':
      case 'ObjectTypeExtension':
      case 'InterfaceTypeExtension':
      case 'UnionTypeExtension':
      case 'EnumTypeExtension':
      case 'InputObjectTypeExtension':
        throw new Error("Extensions are a TODO");
    }
  }
  return schema;
}

function buildNamedTypeAndDirectivesShallow(documentNode: DocumentNode, schema: Schema) {
  for (const definitionNode of documentNode.definitions) {
    switch (definitionNode.kind) {
      case 'ScalarTypeDefinition':
      case 'ObjectTypeDefinition':
      case 'InterfaceTypeDefinition':
      case 'UnionTypeDefinition':
      case 'EnumTypeDefinition':
      case 'InputObjectTypeDefinition':
        schema.addType(newNamedType(withoutTrailingDefinition(definitionNode.kind), definitionNode.name.value));
        break;
      case 'DirectiveDefinition':
        schema.addDirectiveDefinition(definitionNode.name.value);
        break;
    }
  }
}

type NodeWithDirectives = {directives?: ReadonlyArray<DirectiveNode>};
type NodeWithDescription = {description?: Maybe<StringValueNode>};
type NodeWithArguments = {arguments?: ReadonlyArray<ArgumentNode>};

function withoutTrailingDefinition(str: string): NamedTypeKind {
  return str.slice(0, str.length - 'Definition'.length) as NamedTypeKind;
}

function getReferencedType(node: NamedTypeNode, schema: Schema): NamedType {
  const type = schema.type(node.name.value);
  if (!type) {
    throw new GraphQLError(`Unknown type ${node.name.value}`, node);
  }
  return type;
}

function buildSchemaDefinitionInner(schemaNode: SchemaDefinitionNode, schemaDefinition: SchemaDefinition) {
  for (const opTypeNode of schemaNode.operationTypes) {
    schemaDefinition.setRoot(opTypeNode.operation, opTypeNode.type.name.value, opTypeNode);
  }
  schemaDefinition.sourceAST = schemaNode;
  schemaDefinition.description = schemaNode.description?.value;
  buildAppliedDirectives(schemaNode, schemaDefinition);
}

function buildAppliedDirectives(elementNode: NodeWithDirectives, element: SchemaElement<any>) {
  for (const directive of elementNode.directives ?? []) {
    element.applyDirective(directive.name.value, buildArgs(directive), directive)
  }
}

function buildArgs(argumentsNode: NodeWithArguments): Record<string, any> {
  const args = Object.create(null);
  for (const argNode of argumentsNode.arguments ?? []) {
    args[argNode.name.value] = buildValue(argNode.value);
  }
  return args;
}

function buildNamedTypeInner(definitionNode: DefinitionNode & NodeWithDirectives & NodeWithDescription, type: NamedType) {
  switch (definitionNode.kind) {
    case 'ObjectTypeDefinition':
    case 'InterfaceTypeDefinition':
      const fieldBasedType = type as ObjectType | InterfaceType;
      for (const fieldNode of definitionNode.fields ?? []) {
        buildFieldDefinitionInner(fieldNode, fieldBasedType.addField(fieldNode.name.value));
      }
      for (const itfNode of definitionNode.interfaces ?? []) {
        fieldBasedType.addImplementedInterface(itfNode.name.value, itfNode);
      }
      break;
    case 'UnionTypeDefinition':
      const unionType = type as UnionType;
      for (const namedType of definitionNode.types ?? []) {
        unionType.addType(namedType.name.value, namedType);
      }
      break;
    case 'EnumTypeDefinition':
      const enumType = type as EnumType;
      for (const enumVal of definitionNode.values ?? []) {
        enumType.addValue(enumVal.name.value);
      }
      break;
    case 'InputObjectTypeDefinition':
      const inputObjectType = type as InputObjectType;
      for (const fieldNode of definitionNode.fields ?? []) {
        buildInputFieldDefinitionInner(fieldNode, inputObjectType.addField(fieldNode.name.value));
      }
      break;
  }
  buildAppliedDirectives(definitionNode, type);
  type.description = definitionNode.description?.value;
  type.sourceAST = definitionNode;
}

function buildFieldDefinitionInner(fieldNode: FieldDefinitionNode, field: FieldDefinition<any>) {
  const type = buildWrapperTypeOrTypeRef(fieldNode.type, field.schema()!);
  field.type = ensureOutputType(type, fieldNode.type);
  for (const inputValueDef of fieldNode.arguments ?? []) {
    buildArgumentDefinitionInner(inputValueDef, field.addArgument(inputValueDef.name.value));
  }
  buildAppliedDirectives(fieldNode, field);
  field.description = fieldNode.description?.value;
  field.sourceAST = fieldNode;
}

export function ensureOutputType(type: Type, node: TypeNode): OutputType {
  if (isOutputType(type)) {
    return type;
  } else {
    throw new GraphQLError(`Expected ${type} to be an output type`, node);
  }
}

export function ensureInputType(type: Type, node: TypeNode): InputType {
  if (isInputType(type)) {
    return type;
  } else {
    throw new GraphQLError(`Expected ${type} to be an input type`, node);
  }
}

function buildWrapperTypeOrTypeRef(typeNode: TypeNode, schema: Schema): Type {
  switch (typeNode.kind) {
    case 'ListType':
      return new ListType(buildWrapperTypeOrTypeRef(typeNode.type, schema));
    case 'NonNullType':
      const wrapped = buildWrapperTypeOrTypeRef(typeNode.type, schema);
      if (wrapped.kind == 'NonNullType') {
        throw new GraphQLError(`Cannot apply the non-null operator (!) twice to the same type`, typeNode);
      }
      return new NonNullType(wrapped);
    default:
      return getReferencedType(typeNode, schema);
  }
}

function buildArgumentDefinitionInner(inputNode: InputValueDefinitionNode, arg: ArgumentDefinition<any>) {
  const type = buildWrapperTypeOrTypeRef(inputNode.type, arg.schema()!);
  arg.type = ensureInputType(type, inputNode.type);
  arg.defaultValue = buildValue(inputNode.defaultValue);
  buildAppliedDirectives(inputNode, arg);
  arg.description = inputNode.description?.value;
  arg.sourceAST = inputNode;
}

function buildInputFieldDefinitionInner(fieldNode: InputValueDefinitionNode, field: InputFieldDefinition) {
  const type = buildWrapperTypeOrTypeRef(fieldNode.type, field.schema()!);
  field.type = ensureInputType(type, fieldNode.type);
  buildAppliedDirectives(fieldNode, field);
  field.description = fieldNode.description?.value;
  field.sourceAST = fieldNode;
}

function buildDirectiveDefinitionInner(directiveNode: DirectiveDefinitionNode, directive: DirectiveDefinition) {
  for (const inputValueDef of directiveNode.arguments ?? []) {
    buildArgumentDefinitionInner(inputValueDef, directive.addArgument(inputValueDef.name.value));
  }
  directive.repeatable = directiveNode.repeatable;
  const locations = directiveNode.locations.map(({ value }) => value as DirectiveLocationEnum);
  directive.addLocations(...locations);
  directive.description = directiveNode.description?.value;
  directive.sourceAST = directiveNode;
}
