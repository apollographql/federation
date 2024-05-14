/**
 * The TypeScript interface to the `wasm` module (implemented in Rust) with all the helpers needed to convert between
 * the two.
 */

import {Schema} from "./definitions";
import {
    ConstObjectValueNode,
    DefinitionNode,
    DocumentNode,
    GraphQLError,
    print,
} from "graphql/index";
import {FeatureUrl, LinkDirectiveArgs} from "./specs/coreSpec";
import {connectIdentity} from "./specs/connectSpec";
import {aggregateError} from "./error";
import {ErrorLocation, SourceArgument, SourceDirective} from "../wasm/node";
import {ASTNode, ConstValueNode, SchemaExtensionNode, StringValueNode} from "graphql";

/**
 * @throws AggregateGraphQLError
 */
export function validateSubgraphSchema(schema: Schema, ast: DocumentNode) {
    const errors = [];
    if (hasConnectDirectives(schema)) {
        errors.push(...validateConnectDirectives(ast));
    }

    if (errors.length > 0) {
        throw aggregateError("FROM_WASM", "WASM validation detected errors", errors)
    }
}

function hasConnectDirectives(schema: Schema): boolean {
    return schema.schemaDefinition.appliedDirectivesOf<LinkDirectiveArgs>('link')
        .some(linkDirective => {
            const {url, import: imports} = linkDirective.arguments();
            const featureUrl = FeatureUrl.maybeParse(url);
            return imports && featureUrl && featureUrl.identity === connectIdentity && imports.some(nameOrRename => {
                const originalName = typeof nameOrRename === 'string' ? nameOrRename : nameOrRename.name;
                return originalName === '@source' || originalName === '@connect';
            });
        });
}

function validateConnectDirectives(ast: DocumentNode): GraphQLError[] {
    // TODO: pass the _original_ source, not the one with added federation stuff (otherwise positions will be wrong)
    // TODO: unless, of course, there's already infrastructure up above which does translation somehow
    const {validate_connect_directives} =
        require('../wasm/node') as typeof import('../wasm/node');
    const source = print(ast)
    return validate_connect_directives(source).map(
        raw => new GraphQLError(raw.message, {
            // source: new Source(source),
            nodes: raw.location && findNode(ast, raw.location),
            extensions: {code: raw.code},
        }),
    );
}


function findNode(ast: DocumentNode, location: ErrorLocation): ASTNode | undefined {
    if (location.source) {
        const sourceDirective = findSourceDirective(ast, location.source);
        if (sourceDirective) {
            return sourceDirective;
        }
    }
    return undefined;
}

function findSourceDirective(ast: DocumentNode, sourceDirective: SourceDirective): ASTNode | undefined {
    const schema = ast.definitions.find(isSchemaExtension);
    const sourceDirectives = schema?.directives?.
        filter(directive => directive.name.value === "source");
    const matchingSource = sourceDirectives?.find(directive => {
        const nameArg = directive.arguments?.find(arg => arg.name.value === "name");
        return nameArg && isStringValue(nameArg.value) && nameArg.value.value === sourceDirective.name;
    });
    if (sourceDirective.arg === SourceArgument.Url) {
        const arg = matchingSource?.arguments?.find(arg => arg.name.value === "http");
        const value = arg?.value;
        if (value && isObjectValue(value)) {
            const field = value.fields.find(field => field.name.value === "baseURL");
            if (field) {
                return field;
            }
        }
    } else if (sourceDirective.arg === SourceArgument.Name) {
        const arg = matchingSource?.arguments?.find(arg => arg.name.value === "name");
        if (arg) {
            return arg;
        }
    }
    return matchingSource;
}

function isSchemaExtension(node: DefinitionNode): node is SchemaExtensionNode {
    return node.kind === "SchemaExtension";
}

function isStringValue(node: ConstValueNode): node is StringValueNode {
    return node.kind === "StringValue";
}

function isObjectValue(node: ConstValueNode): node is ConstObjectValueNode {
    return node.kind === "ObjectValue";
}
