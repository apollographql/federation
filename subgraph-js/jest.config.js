const baseConfig = require('../jest.config.base');

/** @typedef {import('ts-jest/dist/types')} */
/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  ...baseConfig,
  setupFilesAfterEnv: ['./src/__tests__/testSetup.ts'],
  displayName: {
    name: "@apollo/subgraph",
    color: "blue",
  },
  snapshotSerializers: [
    '@apollo/core-schema/dist/snapshot-serializers/ast',
    '@apollo/core-schema/dist/snapshot-serializers/raw',
    '@apollo/core-schema/dist/snapshot-serializers/gref',
    '@apollo/core-schema/dist/snapshot-serializers/redirect',
  ]
};
