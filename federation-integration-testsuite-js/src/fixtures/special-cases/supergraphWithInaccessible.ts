import { composeAndValidate } from '@apollo/federation';
import { assertCompositionSuccess } from '@apollo/federation/dist/composition/utils';
import {
  DirectiveDefinitionNode,
  SchemaDefinitionNode,
  DocumentNode,
  DirectiveNode,
  parse,
  visit,
} from 'graphql';
import { fixtures } from '..';

const compositionResult = composeAndValidate(fixtures);
assertCompositionSuccess(compositionResult);
const parsed = parse(compositionResult.supergraphSdl);

// We need to collect the AST for the inaccessible definition as well
// as the @core and @inaccessible usages. Parsing SDL is a fairly
// clean approach to this and easier to update than handwriting the AST.
const [inaccessibleDefinition, schemaDefinition] = parse(`#graphql
  # inaccessibleDefinition
  directive @inaccessible on FIELD_DEFINITION
  schema
    # inaccessibleCoreUsage
    @core(feature: "https://specs.apollo.dev/inaccessible/v0.1")
    # inaccessibleUsage
    @inaccessible {
      query: Query
    }
  `).definitions as [DirectiveDefinitionNode, SchemaDefinitionNode];

const [inaccessibleCoreUsage, inaccessibleUsage] =
  schemaDefinition.directives as [DirectiveNode, DirectiveNode];

// Append the AST with the inaccessible definition,
// @core inaccessible usage, and @inaccessible usage on the `ssn` field
const superGraphWithInaccessible: DocumentNode = visit(parsed, {
  Document(node) {
    return {
      ...node,
      definitions: [...node.definitions, inaccessibleDefinition],
    };
  },
  SchemaDefinition(node) {
    return {
      ...node,
      directives: [...(node.directives ?? []), inaccessibleCoreUsage],
    };
  },
  ObjectTypeDefinition(node) {
    return {
      ...node,
      fields:
        node.fields?.map((field) => {
          if (field.name.value === 'ssn') {
            return {
              ...field,
              directives: [...(field.directives ?? []), inaccessibleUsage],
            };
          }
          return field;
        }) ?? [],
    };
  },
});

export { superGraphWithInaccessible };
