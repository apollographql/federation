Object.defineProperty(exports, "__esModule", { value: true });
if (!sdl) {
    done({
        Err: [{ message: 'Error in JS-Rust-land: SDL is empty.' }],
    });
}
try {
    const introspected = bridge.batchIntrospect(sdl, queries);
    done({ Ok: introspected });
}
catch (err) {
    done({
        Err: err,
    });
}
//# sourceMappingURL=do_introspect.js.map