const makeServiceWorkerEnv = require("service-worker-mock");

const HASH = "<hash>";

export const getEvent = (request: Request): any => {
  const waitUntil = async (callback: any) => {
    await callback;
  };
  return {
    request,
    waitUntil,
  };
};
const store: any = {
  "404.<hash>.html": "404.html",
  "install.<hash>.sh": "install cli",
};
export const mockKV = (store: any) => {
  return {
    get: (path: string) => store[path] || null,
  };
};

export const mockManifest = () => {
  return JSON.stringify({
    "404.html": `404.${HASH}.html`,
    "install.sh": `install.${HASH}.sh`,
  });
};
let cacheStore: any = {};
export const mockCaches = () => {
  return {
    default: {
      match: (key: Request) => {
        const url = key.url;
        return cacheStore[url] || null;
      },
      put: (key: Request, val: Response) => {
        let headers = new Headers(val.headers);
        let resp = new Response(val.body, { headers });
        const url = key.url;
        return (cacheStore[url] = resp);
      },
    },
  };
};

export function mockGlobal() {
  Object.assign(global, makeServiceWorkerEnv());
  Object.assign(global, { __STATIC_CONTENT_MANIFEST: mockManifest() });
  Object.assign(global, { __STATIC_CONTENT: mockKV(store) });
  Object.assign(global, { caches: mockCaches() });
  Object.assign(global, {
    SENTRY_PROJECT_ID: "123456",
    SENTRY_KEY: "0000aaaa1111bbbb2222cccc3333dddd",
    SEGMENT_API_KEY: "1234567",
  });
}
