import { ASTNode, ASTVisitor, GraphQLError, introspectionTypes, isTypeDefinitionNode, isTypeExtensionNode, isTypeSystemDefinitionNode, isTypeSystemExtensionNode, specifiedScalarTypes, ValidationContext } from "graphql";
import { SDLValidationContext } from "graphql/validation/ValidationContext";
import { isFederationTypeName } from "../federation";
import { didYouMean, suggestionList } from "../suggestions";

/**
 * Modified version of the 'Known type names' GraphQL-js rule that allows types to only be defined as "extensions".
 *
 * This also ignore the types specific by federation (_Entity, _Any and _Service): those will exists even if they
 * are not in the original user AST (note that this exception was added to support some strange customer schema
 * where the subgraph declared `_entities` and `_service` fields where declared in `Query` _but_ the related type
 * were not.
 */
export function KnownTypeNamesInFederationRule(
  context: ValidationContext | SDLValidationContext,
): ASTVisitor {
  const schema = context.getSchema();
  const existingTypesMap = schema ? schema.getTypeMap() : Object.create(null);

  const definedTypes = Object.create(null);
  for (const def of context.getDocument().definitions) {
    // Note: this is the one change  compared to the original GraphQL-js rule: we recore type extensions names as well.
    if (isTypeDefinitionNode(def) || isTypeExtensionNode(def)) {
      definedTypes[def.name.value] = true;
    }
  }

  const typeNames = Object.keys(existingTypesMap).concat(
    Object.keys(definedTypes),
  );

  return {
    NamedType(node, _1, parent, _2, ancestors) {
      const typeName = node.name.value;
      if (!existingTypesMap[typeName] && !definedTypes[typeName]) {
        const definitionNode = ancestors[2] ?? parent;
        const isSDL = definitionNode != null && isSDLNode(definitionNode);
        if (isSDL && isStandardTypeName(typeName)) {
          return;
        }

        const suggestedTypes = suggestionList(
          typeName,
          isSDL ? standardTypeNames.concat(typeNames) : typeNames,
        );
        context.reportError(
          new GraphQLError(
            `Unknown type "${typeName}".` + didYouMean(suggestedTypes),
            node,
          ),
        );
      }
    },
  };
}

const standardTypeNames = [...specifiedScalarTypes, ...introspectionTypes].map(
  (type) => type.name,
);

function isStandardTypeName(typeName: string): boolean {
  return standardTypeNames.indexOf(typeName) !== -1 || isFederationTypeName(typeName);
}

function isSDLNode(value: ASTNode | readonly ASTNode[]): boolean {
  return (
    !Array.isArray(value) &&
    (isTypeSystemDefinitionNode(value as ASTNode) || isTypeSystemExtensionNode(value as ASTNode))
  );
}
