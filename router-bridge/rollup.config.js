import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import nodePolyfills from 'rollup-plugin-node-polyfills';
import path from 'path';

export default [
  {
    input: path.resolve(__dirname, './js-dist/url_polyfill.js'),
    output: {
      name: 'url_polyfill',
      file: path.resolve(__dirname, './bundled/url_polyfill.js'),
      format: 'iife',
      globals: {},
    },
    external: [],
    plugins: [
      json(),
      nodePolyfills(),
      resolve(),
      commonjs(),
    ],
  },
  {
    input: path.resolve(__dirname, './js-dist/index.js'),
    output: {
      name: 'bridge',
      file: path.resolve(__dirname, './bundled/bridge.js'),
      format: 'iife',
      globals: {
        // This must be mocked in the runtime as an
        // empty object. e.g., `node_fetch_1={}`.
        // It will not be used for composition.
        'node-fetch': 'node_fetch_1',
        'url': 'whatwg_url_1',
      },
      sourcemap: true,
    },
    // This just cuts off the awkward traversal that happens because of
    // `apollo-env` which brings in all of `node-fetch`, which in turn tries
    // to load Node.js' `http`, `https`, `stream`, etc.
    external: [
      'node-fetch',
      'url'
    ],
    plugins: [
      json(),
      nodePolyfills(),
      resolve(),
      commonjs(),
    ],
  }
];
