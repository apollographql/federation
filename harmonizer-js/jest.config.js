const config = require('../jest.config.base');

const additionalConfig = {
  testPathIgnorePatterns: [
    ...config.testPathIgnorePatterns,
    ...[]
  ]
};

module.exports = Object.assign(Object.create(null), config, additionalConfig);
