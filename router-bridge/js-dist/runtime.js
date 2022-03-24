Deno.core.ops();
const _newline = new Uint8Array([10]);
function print(value) {
    Deno.core.dispatchByName('op_print', 0, value.toString(), _newline);
}
function done(result) {
    Deno.core.opSync('op_result', result);
}
node_fetch_1 = {};
process = { argv: [], env: { NODE_ENV: 'production' } };
global = {};
exports = {};
//# sourceMappingURL=runtime.js.map