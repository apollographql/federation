import { composeAndValidate } from '@apollo/federation';
import { assertCompositionSuccess } from '@apollo/federation/dist/composition/utils';
import {
  DirectiveDefinitionNode,
  DirectiveNode,
  DocumentNode,
  parse,
  visit,
} from 'graphql';
import * as accounts from './accounts';
import * as books from './books';
import * as documents from './documents';
import * as inventory from './inventory';
import * as product from './product';
import * as reviews from './reviews';

const fixtures = [accounts, books, documents, inventory, product, reviews];
const compositionResult = composeAndValidate(fixtures);
assertCompositionSuccess(compositionResult);
const parsed = parse(compositionResult.supergraphSdl);

const inaccessibleDefinition: DirectiveDefinitionNode = {
  kind: 'DirectiveDefinition',
  name: { kind: 'Name', value: 'inaccessible' },
  locations: [{ kind: 'Name', value: "FIELD_DEFINITION" }],
  repeatable: false,
};

const inaccessibleUsage: DirectiveNode = {
  kind: 'Directive',
  name: { kind: 'Name', value: 'inaccessible' },
};

const inaccessibleCoreUsage: DirectiveNode = {
  kind: 'Directive',
  name: { kind: 'Name', value: 'core' },
  arguments: [
    {
      kind: 'Argument',
      name: { kind: 'Name', value: 'feature' },
      value: {
        kind: 'StringValue',
        value: 'https://specs.apollo.dev/inaccessible/v0.1',
      },
    },
  ],
};

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
