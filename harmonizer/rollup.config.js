import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import nodePolyfills from 'rollup-plugin-node-polyfills';
import path from 'path';

const outputDir = process.env['APOLLO_HARMONIZER_ROLLUP_BASE_DIR'] || __dirname;

export default [
  {
    input: path.resolve(__dirname, './js/index.mjs'),
    output: {
      name: 'composition',
      file: path.resolve(outputDir, './dist/composition.js'),
      format: 'iife',
      globals: {
        // This must be mocked in the runtime as an
        // empty object. e.g., `node_fetch_1={}`.
        // It will not be used for composition.
        'node-fetch': 'node_fetch_1',
      },
      sourcemap: true,
    },
    // This just cuts off the awkward traversal that happens because of
    // `apollo-env` which brings in all of `node-fetch`, which in turn tries
    // to load Node.js' `http`, `https`, `stream`, etc.
    external: ['node-fetch'],
    plugins: [
      nodePolyfills(),
      resolve(),
      commonjs(),
    ],
  }
];
