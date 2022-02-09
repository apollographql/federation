const baseConfig = require('../jest.config.base');

/** @typedef {import('ts-jest/dist/types')} */
/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  ...baseConfig,
  setupFilesAfterEnv: ['./src/__tests__/testSetup.ts'],
  displayName: {
    name: "federation-rs-integration",
    color: "orange",
  },
  "testPathIgnorePatterns" : [
    "<rootDir>/federation-rs/"
  ]
};
