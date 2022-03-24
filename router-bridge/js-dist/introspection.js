Object.defineProperty(exports, "__esModule", { value: true });
exports.introspect = exports.batchIntrospect = void 0;
const graphql_1 = require("graphql");
function batchIntrospect(sdl, queries) {
    let schema;
    try {
        schema = (0, graphql_1.buildSchema)(sdl);
    }
    catch (e) {
        return Array(queries.length).fill({
            errors: [e],
        });
    }
    if (!schema) {
        return Array(queries.length).fill({
            errors: [new Error(`couldn't build schema from SDL`)],
        });
    }
    return queries.map((query) => introspectOne(schema, query));
}
exports.batchIntrospect = batchIntrospect;
function introspect(sdl, query) {
    let schema;
    try {
        schema = (0, graphql_1.buildSchema)(sdl);
    }
    catch (e) {
        return {
            errors: [e],
        };
    }
    if (!schema) {
        return {
            errors: [new graphql_1.GraphQLError("couldn't build schema from SDL")],
        };
    }
    return introspectOne(schema, query);
}
exports.introspect = introspect;
const introspectOne = (schema, query) => {
    const { data, errors } = (0, graphql_1.graphqlSync)({ schema, source: query });
    if (errors) {
        return { data, errors: [...errors] };
    }
    else {
        return { data, errors: [] };
    }
};
//# sourceMappingURL=introspection.js.map