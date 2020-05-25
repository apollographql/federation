var nodeCrypto = require("crypto");

global.crypto = {
  getRandomValues: function (buffer) {
    return nodeCrypto.randomFillSync(buffer);
  },
};

const noop = () => {};

// Browser globals
global.URL = jest.fn((url) => ({ search: url, href: url }));
global.Request = jest.fn(() => ({ url: "/" }));
global.Response = Object;
global.fetch = jest.fn(() => Promise.resolve({ status: 200 }));
global.btoa = jest.fn((str) => str);

global.logger = {
  group: noop,
  groupEnd: noop,
  log: noop,
  warn: noop,
  error: noop,
};
