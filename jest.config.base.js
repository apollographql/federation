const { defaults } = require("jest-config");

/** @typedef {import('ts-jest/dist/types')} */
/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  testEnvironment: "node",
    preset: "ts-jest",
    testMatch: null,
    testRegex: "/__tests__/.*\\.test\\.(js|ts)$",
    testPathIgnorePatterns: [
      "/node_modules/",
      "/dist/"
    ],
    moduleFileExtensions: [...defaults.moduleFileExtensions, "ts", "tsx"],
    moduleNameMapper: {
      '^__mocks__/(.*)$': '<rootDir>/src/__mocks__/$1',
    },
    clearMocks: true,
    globals: {
      "ts-jest": {
        tsconfig: "<rootDir>/src/__tests__/tsconfig.json",
        diagnostics: false
      }
    }
};
