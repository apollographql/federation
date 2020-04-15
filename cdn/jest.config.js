module.exports = {
  preset: 'ts-jest',
  testEnvironment: "node",
  globals: {
    SENTRY_PROJECT_ID: '123456',
    SENTRY_KEY: '0000aaaa1111bbbb2222cccc3333dddd'
  },
  setupFiles: ['./src/jest.setup.js'],
  coveragePathIgnorePatterns: ['./src/mock.ts']
};