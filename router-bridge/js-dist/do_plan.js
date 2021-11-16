var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const planResult = bridge.plan(schemaString, queryString, operationName);
if (((_a = planResult.errors) === null || _a === void 0 ? void 0 : _a.length) > 0) {
    done({ Err: planResult.errors });
}
else {
    done({ Ok: planResult.data });
}
//# sourceMappingURL=do_plan.js.map