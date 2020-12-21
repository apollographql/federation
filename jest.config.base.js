const { defaults } = require("jest-config");

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
      // This regex should match the packages that we want compiled from source
      // through `ts-jest`, as opposed to loaded from their output files in
      // `dist`.
      '^((?:federation-js|gateway-js|harmonizer-js)[^/]*)(?:/dist)?((?:/.*)|$)': '<rootDir>/../$1/src$2'
    },
    clearMocks: true,
    globals: {
      "ts-jest": {
        tsConfig: "<rootDir>/src/__tests__/tsconfig.json",
        diagnostics: false
      }
    }
};
