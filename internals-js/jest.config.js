const baseConfig = require('../jest.config.base');

/** @typedef {import('ts-jest/dist/types')} */
/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  ...baseConfig,
  displayName: {
    name: '@apollo/federation-internals',
    color: 'magenta'
  }
};
