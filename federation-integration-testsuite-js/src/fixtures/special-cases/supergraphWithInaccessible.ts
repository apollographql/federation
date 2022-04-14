import { composeServices } from '@apollo/composition';
import {
  DirectiveDefinitionNode,
  SchemaDefinitionNode,
  DocumentNode,
  DirectiveNode,
  parse,
  visit,
} from 'graphql';
import { fixtures } from '..';
import { assert } from '@apollo/federation-internals';

const compositionResult = composeServices(fixtures);
assert(!compositionResult.errors, () => `Unexpected errors composing test fixtures:\n${compositionResult.errors!.join('\n\n')}`);

const parsed = parse(compositionResult.supergraphSdl);

// We need to collect the AST for the inaccessible definition as well
// as the @core and @inaccessible usages. Parsing SDL is a fairly
// clean approach to this and easier to update than handwriting the AST.
const [inaccessibleDefinition, schemaDefinition] = parse(`#graphql
  # inaccessibleDefinition
  directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION
  schema
    # inaccessibleCoreUsage
    @link(url: "https://specs.apollo.dev/inaccessible/v0.1", for: SECURITY)
    # inaccessibleUsage
    @inaccessible {
      query: Query
    }
  `).definitions as [DirectiveDefinitionNode, SchemaDefinitionNode];

const [inaccessibleCoreUsage, inaccessibleUsage] =
  schemaDefinition.directives as [DirectiveNode, DirectiveNode];

// Append the AST with the inaccessible definition, and @core inaccessible usage
let superGraphWithInaccessible: DocumentNode = visit(parsed, {
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
});

// Append @inaccessible usage to the `Car` type, `ssn` field, and `topCars` field
superGraphWithInaccessible = visit(
  superGraphWithInaccessible,
  {
    ObjectTypeDefinition(node) {
      if (node.name.value === 'Car') {
        return {
          ...node,
          directives: [...(node.directives ?? []), inaccessibleUsage],
        };
      }
      return node;
    },
    FieldDefinition(node) {
      if (node.name.value === 'ssn') {
        return {
          ...node,
          directives: [...(node.directives ?? []), inaccessibleUsage],
        };
      }
      if (node.name.value === 'topCars') {
        return {
          ...node,
          directives: [...(node.directives ?? []), inaccessibleUsage],
        };
      }
      return node;
    }
  },
);

export { superGraphWithInaccessible };
