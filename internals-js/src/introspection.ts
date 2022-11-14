import { DirectiveLocation } from "graphql";
import { EnumType, FieldDefinition, ListType, NonNullType, ObjectType, Schema } from "./definitions";

export const introspectionFieldNames = [ '__schema', '__type' ];
export const introspectionTypeNames = [
  '__Schema',
  '__Directive',
  '__DirectiveLocation',
  '__Type',
  '__Field',
  '__InputValue',
  '__EnumValue',
  '__TypeKind',
]

export function isIntrospectionName(name: string): boolean {
  return name.startsWith('__');
}

export function addIntrospectionFields(schema: Schema) {
  if (schema.type('__Schema')) {
    return;
  }
  const typeKindEnum = schema.addType(new EnumType('__TypeKind', true));
  typeKindEnum.addValue('SCALAR');
  typeKindEnum.addValue('OBJECT');
  typeKindEnum.addValue('INTERFACE');
  typeKindEnum.addValue('UNION');
  typeKindEnum.addValue('ENUM');
  typeKindEnum.addValue('INPUT_OBJECT');
  typeKindEnum.addValue('LIST');
  typeKindEnum.addValue('NON_NULL');

  const inputValueType = schema.addType(new ObjectType('__InputValue', true));
  const fieldType = schema.addType(new ObjectType('__Field', true));
  const typeType = schema.addType(new ObjectType('__Type', true));
  const enumValueType = schema.addType(new ObjectType('__EnumValue', true));

  typeType.addField('kind', new NonNullType(typeKindEnum));
  typeType.addField('name', schema.stringType());
  typeType.addField('description', schema.stringType());
  typeType.addField('fields', new ListType(new NonNullType(fieldType)))
    .addArgument('includeDeprecated', schema.booleanType(), false);
  typeType.addField('interfaces', new ListType(new NonNullType(typeType)));
  typeType.addField('possibleTypes', new ListType(new NonNullType(typeType)));
  typeType.addField('enumValues', new ListType(new NonNullType(enumValueType)))
    .addArgument('includeDeprecated', schema.booleanType(), false);
  typeType.addField('inputFields', new ListType(new NonNullType(inputValueType)))
    .addArgument('includeDeprecated', schema.booleanType(), false);
  typeType.addField('ofType', typeType);
  typeType.addField('specifiedByURL', schema.stringType());

  fieldType.addField('name', new NonNullType(schema.stringType()));
  fieldType.addField('description', schema.stringType());
  fieldType.addField('args', new NonNullType(new ListType(new NonNullType(inputValueType))))
    .addArgument('includeDeprecated', schema.booleanType(), false);
  fieldType.addField('type', new NonNullType(typeType));
  fieldType.addField('isDeprecated', new NonNullType(schema.booleanType()));
  fieldType.addField('deprecationReason', schema.stringType());

  inputValueType.addField('name', new NonNullType(schema.stringType()));
  inputValueType.addField('description', schema.stringType());
  inputValueType.addField('type', new NonNullType(typeType));
  inputValueType.addField('defaultValue', schema.stringType());
  inputValueType.addField('isDeprecated', new NonNullType(schema.booleanType()));
  inputValueType.addField('deprecationReason', schema.stringType());

  enumValueType.addField('name', new NonNullType(schema.stringType()));
  enumValueType.addField('description', schema.stringType());
  enumValueType.addField('isDeprecated', new NonNullType(schema.booleanType()));
  enumValueType.addField('deprecationReason', schema.stringType());

  const directiveLocationEnum = schema.addType(new EnumType('__DirectiveLocation', true));
  for (const location of Object.values(DirectiveLocation)) {
    directiveLocationEnum.addValue(location);
  }

  const directiveType = schema.addType(new ObjectType('__Directive', true));
  directiveType.addField('name', new NonNullType(schema.stringType()));
  directiveType.addField('description', schema.stringType());
  directiveType.addField('locations', new NonNullType(new ListType(new NonNullType(directiveLocationEnum))));
  directiveType.addField('args', new NonNullType(new ListType(new NonNullType(inputValueType))))
    .addArgument('includeDeprecated', schema.booleanType(), false);
  directiveType.addField('isRepeatable', new NonNullType(schema.booleanType()));

  const schemaType = schema.addType(new ObjectType('__Schema', true));
  schemaType.addField('description', schema.stringType());
  schemaType.addField('types', new NonNullType(new ListType(new NonNullType(typeType))));
  schemaType.addField('queryType', new NonNullType(typeType));
  schemaType.addField('mutationType', new NonNullType(typeType));
  schemaType.addField('subscriptionType', new NonNullType(typeType));
  schemaType.addField('directives', new NonNullType(new ListType(new NonNullType(directiveType))));

  let queryRoot = schema.schemaDefinition.rootType('query');
  if (!queryRoot) {
    queryRoot = schema.addType(new ObjectType('Query'));
    schema.schemaDefinition.setRoot('query', queryRoot);
  }

  queryRoot.addField(new FieldDefinition('__schema', true), new NonNullType(schemaType));
  queryRoot.addField(new FieldDefinition('__type', true), typeType)
    .addArgument('name', new NonNullType(schema.stringType()));
}
