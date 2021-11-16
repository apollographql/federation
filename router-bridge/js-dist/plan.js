Object.defineProperty(exports, "__esModule", { value: true });
exports.plan = void 0;
const graphql_1 = require("graphql");
const query_planner_1 = require("@apollo/query-planner");
const federation_internals_1 = require("@apollo/federation-internals");
function plan(schemaString, operationString, operationName) {
    try {
        const composedSchema = (0, federation_internals_1.buildSchema)(schemaString);
        const operationDocument = (0, graphql_1.parse)(operationString);
        const operation = (0, federation_internals_1.operationFromDocument)(composedSchema, operationDocument, operationName);
        const planner = new query_planner_1.QueryPlanner(composedSchema);
        return { data: planner.buildQueryPlan(operation) };
    }
    catch (e) {
        return { errors: [e] };
    }
}
exports.plan = plan;
//# sourceMappingURL=plan.js.map